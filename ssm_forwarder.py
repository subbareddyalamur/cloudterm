#!/usr/bin/env python3
"""
SSM Port Forwarder Service

This service manages AWS SSM port forwarding sessions for RDP connections.
It runs inside Docker and exposes forwarded ports on the Docker network,
allowing Guacamole to connect to Windows instances via RDP.

The service provides a REST API for:
- Starting port forwarding sessions
- Stopping sessions
- Listing active sessions
- Health checks
"""

import os
import subprocess
import threading
import time
import signal
import socket
from flask import Flask, jsonify, request
import boto3
import botocore.exceptions

app = Flask(__name__)

# Store active port forwarding sessions
# Key: instance_id, Value: session info dict
active_sessions = {}

# Port allocation range (these ports are available within the Docker network)
# Can be configured via environment variables
PORT_RANGE_START = int(os.environ.get('PORT_RANGE_START', 33890))
PORT_RANGE_END = int(os.environ.get('PORT_RANGE_END', 33999))
allocated_ports = set()


def get_available_port():
    """Get an available port from the pre-allocated range."""
    for port in range(PORT_RANGE_START, PORT_RANGE_END + 1):
        if port not in allocated_ports:
            # Verify the port is actually available
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.bind(('0.0.0.0', port))
                sock.close()
                return port
            except OSError:
                continue
    return None


def check_instance_status(instance_id, profile, region):
    """Check if an EC2 instance is connected to SSM."""
    try:
        session = boto3.Session(profile_name=profile, region_name=region)
        ssm_client = session.client('ssm')

        response = ssm_client.describe_instance_information(
            Filters=[{'Key': 'InstanceIds', 'Values': [instance_id]}]
        )

        if response['InstanceInformationList']:
            instance_info = response['InstanceInformationList'][0]
            status = instance_info['PingStatus']
            print(f"Instance {instance_id} status: {status}")
            return status == 'Online'
        else:
            print(f"Instance {instance_id} not found in SSM")
            return False

    except botocore.exceptions.ClientError as e:
        print(f"AWS Error checking instance status: {str(e)}")
        return False
    except Exception as e:
        print(f"Error checking instance status: {str(e)}")
        return False


def start_port_forwarding(instance_id, aws_profile, aws_region, local_port, external_port):
    """
    Start an SSM port forwarding session with socat relay.

    SSM binds to localhost only, so we use socat to relay from 0.0.0.0:external_port
    to 127.0.0.1:ssm_port, making the port accessible from other containers.

    We use different ports to avoid conflicts:
    - SSM binds to 127.0.0.1:(local_port + 10000)
    - socat listens on 0.0.0.0:local_port and forwards to 127.0.0.1:(local_port + 10000)
    """
    env = os.environ.copy()
    env['AWS_PROFILE'] = aws_profile
    env['AWS_DEFAULT_REGION'] = aws_region

    # Use a different internal port for SSM to avoid binding conflicts
    ssm_port = local_port + 10000

    cmd = [
        'aws', 'ssm', 'start-session',
        '--target', instance_id,
        '--document-name', 'AWS-StartPortForwardingSession',
        '--parameters', f'{{"portNumber":["3389"],"localPortNumber":["{ssm_port}"]}}'
    ]

    print(f"Starting port forwarding: {' '.join(cmd)}")

    ssm_process = subprocess.Popen(
        cmd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )

    # Wait for SSM to start listening
    time.sleep(3)

    # Start socat to relay from 0.0.0.0:external_port to 127.0.0.1:ssm_port
    socat_cmd = [
        'socat',
        f'TCP-LISTEN:{external_port},fork,reuseaddr,bind=0.0.0.0',
        f'TCP:127.0.0.1:{ssm_port}'
    ]

    print(f"Starting socat relay: {' '.join(socat_cmd)}")

    socat_process = subprocess.Popen(
        socat_cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )

    return ssm_process, socat_process


def monitor_session(instance_id):
    """Monitor a port forwarding session and clean up when it ends."""
    session = active_sessions.get(instance_id)
    if not session:
        return

    ssm_process = session['ssm_process']
    socat_process = session.get('socat_process')

    # Wait for SSM process to end
    ssm_process.wait()

    # Clean up socat when SSM ends
    if socat_process and socat_process.poll() is None:
        socat_process.terminate()
        try:
            socat_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            socat_process.kill()

    # Clean up when the session ends
    print(f"Port forwarding session ended for {instance_id}")
    if instance_id in active_sessions:
        port = active_sessions[instance_id]['local_port']
        allocated_ports.discard(port)
        del active_sessions[instance_id]


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'active_sessions': len(active_sessions),
        'allocated_ports': len(allocated_ports)
    })


@app.route('/sessions', methods=['GET'])
def list_sessions():
    """List all active port forwarding sessions."""
    sessions_info = []
    for instance_id, session in active_sessions.items():
        ssm_running = session['ssm_process'].poll() is None
        socat_running = session.get('socat_process') and session['socat_process'].poll() is None
        sessions_info.append({
            'instance_id': instance_id,
            'instance_name': session.get('instance_name', 'Unknown'),
            'local_port': session['local_port'],
            'status': 'running' if (ssm_running and socat_running) else 'stopped',
            'started_at': session.get('started_at', 'Unknown')
        })
    return jsonify({'sessions': sessions_info})


@app.route('/start', methods=['POST'])
def start_session():
    """Start a new port forwarding session."""
    try:
        data = request.get_json()
        instance_id = data.get('instance_id')
        instance_name = data.get('instance_name', 'Unknown')
        aws_profile = data.get('aws_profile')
        aws_region = data.get('aws_region')

        if not instance_id:
            return jsonify({'success': False, 'error': 'Instance ID is required'}), 400

        if not aws_profile or not aws_region:
            return jsonify({'success': False, 'error': 'AWS profile and region are required'}), 400

        # Check if we already have an active session for this instance
        if instance_id in active_sessions:
            session = active_sessions[instance_id]
            ssm_running = session['ssm_process'].poll() is None
            socat_running = session.get('socat_process') and session['socat_process'].poll() is None
            if ssm_running and socat_running:
                # Session is still running
                return jsonify({
                    'success': True,
                    'instance_id': instance_id,
                    'local_port': session['local_port'],
                    'host': 'ssm-forwarder',
                    'message': 'Existing session reused'
                })
            else:
                # Session ended, clean up
                if session.get('socat_process') and session['socat_process'].poll() is None:
                    session['socat_process'].terminate()
                allocated_ports.discard(session['local_port'])
                del active_sessions[instance_id]

        # Check instance status
        if not check_instance_status(instance_id, aws_profile, aws_region):
            return jsonify({
                'success': False,
                'error': f'Instance {instance_id} is not connected to SSM'
            }), 400

        # Get available port
        local_port = get_available_port()
        if not local_port:
            return jsonify({
                'success': False,
                'error': 'No available ports in the allocation range'
            }), 503

        # Start port forwarding with socat relay
        # external_port is the same as local_port (socat listens on 0.0.0.0:external_port)
        ssm_process, socat_process = start_port_forwarding(
            instance_id, aws_profile, aws_region, local_port, local_port
        )

        # Wait a moment for the session and socat to establish
        time.sleep(1)

        # Check if SSM process is still running
        if ssm_process.poll() is not None:
            stdout, stderr = ssm_process.communicate()
            if socat_process and socat_process.poll() is None:
                socat_process.terminate()
            return jsonify({
                'success': False,
                'error': f'Port forwarding failed: {stderr or stdout}'
            }), 500

        # Check if socat is running
        if socat_process.poll() is not None:
            ssm_process.terminate()
            return jsonify({
                'success': False,
                'error': 'Socat relay failed to start'
            }), 500

        # Store session info
        allocated_ports.add(local_port)
        active_sessions[instance_id] = {
            'ssm_process': ssm_process,
            'socat_process': socat_process,
            'local_port': local_port,
            'instance_name': instance_name,
            'aws_profile': aws_profile,
            'aws_region': aws_region,
            'started_at': time.strftime('%Y-%m-%d %H:%M:%S')
        }

        # Start monitoring thread
        monitor_thread = threading.Thread(
            target=monitor_session,
            args=(instance_id,),
            daemon=True
        )
        monitor_thread.start()

        print(f"Port forwarding established for {instance_id} on port {local_port}")

        return jsonify({
            'success': True,
            'instance_id': instance_id,
            'local_port': local_port,
            'host': 'ssm-forwarder',
            'message': 'Port forwarding established'
        })

    except Exception as e:
        print(f"Error starting session: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/stop', methods=['POST'])
def stop_session():
    """Stop a port forwarding session."""
    try:
        data = request.get_json()
        instance_id = data.get('instance_id')

        if not instance_id:
            return jsonify({'success': False, 'error': 'Instance ID is required'}), 400

        if instance_id not in active_sessions:
            return jsonify({'success': False, 'error': 'No active session for this instance'}), 404

        session = active_sessions[instance_id]

        # Terminate the socat process first
        socat_process = session.get('socat_process')
        if socat_process and socat_process.poll() is None:
            socat_process.terminate()
            try:
                socat_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                socat_process.kill()

        # Terminate the SSM process
        ssm_process = session['ssm_process']
        if ssm_process.poll() is None:
            ssm_process.terminate()
            try:
                ssm_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                ssm_process.kill()

        # Clean up
        allocated_ports.discard(session['local_port'])
        del active_sessions[instance_id]

        return jsonify({
            'success': True,
            'message': f'Session stopped for {instance_id}'
        })

    except Exception as e:
        print(f"Error stopping session: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


def cleanup_sessions():
    """Clean up all active sessions on shutdown."""
    print("Cleaning up active sessions...")
    for instance_id, session in list(active_sessions.items()):
        try:
            # Terminate socat first
            socat_process = session.get('socat_process')
            if socat_process and socat_process.poll() is None:
                socat_process.terminate()
                socat_process.wait(timeout=5)

            # Terminate SSM process
            ssm_process = session['ssm_process']
            if ssm_process.poll() is None:
                ssm_process.terminate()
                ssm_process.wait(timeout=5)
        except Exception as e:
            print(f"Error cleaning up session {instance_id}: {e}")
    print("Cleanup complete")


def signal_handler(signum, frame):
    """Handle shutdown signals."""
    print(f"Received signal {signum}, shutting down...")
    cleanup_sessions()
    exit(0)


if __name__ == '__main__':
    # Register signal handlers
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    port = int(os.environ.get('PORT', 5001))
    print(f"Starting SSM Port Forwarder on port {port}")
    print(f"Port range: {PORT_RANGE_START}-{PORT_RANGE_END}")

    app.run(host='0.0.0.0', port=port, debug=False)
