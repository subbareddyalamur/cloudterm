import os
import sys
import json
import time
import select
import signal
import termios
import struct
import fcntl
import threading
import subprocess
import pty
from flask import Flask, render_template, jsonify
from flask_socketio import SocketIO, emit
import yaml
import boto3
import botocore.exceptions

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Store active sessions
sessions = {}  # Key: session_id, Value: SSMSession object

class SSMSession:
    def __init__(self, instance_id, session_id):
        self.instance_id = instance_id
        self.session_id = session_id
        self.process = None
        self.master_fd = None
        self.running = False
        self.output_thread = None

    def start_session(self):
        try:
            # Get AWS configuration and check instance status first
            config = get_instance_config(self.instance_id)
            if not config:
                print(f"No AWS configuration found for instance {self.instance_id}")
                return False
                
            aws_profile = config['aws_profile']
            aws_region = config['region']
                
            # Check if instance is connected before attempting to start session
            if not check_instance_status(self.instance_id, aws_profile, aws_region):
                print(f"Instance {self.instance_id} is not connected to SSM")
                return False
            
            master_fd, slave_fd = pty.openpty()
            self.master_fd = master_fd
            
            # Get current environment and update AWS settings
            env = os.environ.copy()
            env['AWS_PROFILE'] = aws_profile
            env['AWS_DEFAULT_REGION'] = aws_region
            print(f"Using AWS_PROFILE={aws_profile}, AWS_DEFAULT_REGION={aws_region} for instance {self.instance_id}")
            
            # Start the SSM session with the updated environment
            command = ["aws", "ssm", "start-session", "--target", self.instance_id]
            self.process = subprocess.Popen(
                command,
                stdin=slave_fd,
                stdout=slave_fd,
                stderr=slave_fd,
                preexec_fn=os.setsid,
                env=env
            )
            
            os.close(slave_fd)  # Close slave fd after process started
            
            self.running = True
            self.output_thread = threading.Thread(target=self.read_output)
            self.output_thread.daemon = True
            self.output_thread.start()
            
            return True
        except Exception as e:
            print(f"Error starting session: {str(e)}")
            self.close()
            return False

    def read_output(self):
        try:
            while self.running and self.process and self.process.poll() is None:
                try:
                    r, w, e = select.select([self.master_fd], [], [], 0.1)
                    if self.master_fd in r:
                        try:
                            data = os.read(self.master_fd, 1024)
                            if data:
                                text = data.decode('utf-8', errors='replace')
                                if 'Starting session with SessionId' in text:
                                    print(f"Session established for {self.instance_id} (session {self.session_id})")
                                elif 'Exiting session with sessionId' in text:
                                    print(f"Session disconnected for {self.instance_id} (session {self.session_id})")
                                socketio.emit('terminal_output', {
                                    'instance_id': self.instance_id,
                                    'session_id': self.session_id,
                                    'output': text
                                })
                            else:
                                break
                        except (OSError, IOError) as e:
                            if e.errno == 9:  # Bad file descriptor
                                break
                            print(f"Error reading from terminal: {str(e)}")
                            break
                except select.error:
                    break
        except Exception as e:
            print(f"Error in output thread: {str(e)}")
        finally:
            # Log disconnection if we haven't already
            if self.running:
                socketio.emit('terminal_output', {
                    'instance_id': self.instance_id, 
                    'session_id': self.session_id,
                    'output': f"\r\nSession disconnected for {self.instance_id}\r\n"
                })
            self.running = False

    def write_input(self, data):
        if self.master_fd is not None and self.running:
            try:
                os.write(self.master_fd, data.encode())
            except (OSError, IOError) as e:
                print(f"Error writing to terminal: {str(e)}")
                self.close()

    def resize_terminal(self, rows, cols):
        if self.master_fd is not None and self.running:
            try:
                fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
            except (OSError, IOError) as e:
                print(f"Error resizing terminal: {str(e)}")

    def close(self):
        self.running = False
        
        if self.master_fd is not None:
            try:
                os.close(self.master_fd)
            except (OSError, IOError):
                pass  # Ignore errors on close
            self.master_fd = None
        
        if self.process:
            try:
                os.killpg(os.getpgid(self.process.pid), signal.SIGTERM)
                self.process.wait(timeout=1)  # Wait for process to terminate
            except (ProcessLookupError, subprocess.TimeoutExpired):
                try:
                    os.killpg(os.getpgid(self.process.pid), signal.SIGKILL)
                except ProcessLookupError:
                    pass
            except Exception as e:
                print(f"Error terminating process: {str(e)}")
            self.process = None
        
        if (self.output_thread and 
            self.output_thread.is_alive() and 
            threading.current_thread() != self.output_thread):
            try:
                self.output_thread.join(timeout=1)
            except RuntimeError:
                pass  # Ignore if we can't join the thread
            self.output_thread = None

def get_instance_config(instance_id):
    try:
        with open('instances_list.yaml', 'r') as file:
            data = yaml.safe_load(file)
            for customer, customer_data in data.items():
                for env_name, instances in customer_data.get('instances', {}).items():
                    if isinstance(instances, list):  # Direct list of instances
                        for instance in instances:
                            if instance.get('instance_id') == instance_id:
                                return {
                                    'aws_profile': customer_data.get('aws_profile'),
                                    'region': customer_data.get('region')
                                }
                    else:  # Nested environment structure
                        for instance in instances:
                            if instance.get('instance_id') == instance_id:
                                return {
                                    'aws_profile': customer_data.get('aws_profile'),
                                    'region': customer_data.get('region')
                                }
        print(f"Warning: No configuration found for instance {instance_id}")
        return None
    except Exception as e:
        print(f"Error finding instance configuration: {str(e)}")
        return None

def check_instance_status(instance_id, profile, region):
    try:
        # Use the specified AWS profile and region
        session = boto3.Session(profile_name=profile, region_name=region)
        ssm_client = session.client('ssm')
        
        # Check instance connection status
        response = ssm_client.describe_instance_information(
            Filters=[{'Key': 'InstanceIds', 'Values': [instance_id]}]
        )
        
        if response['InstanceInformationList']:
            instance_info = response['InstanceInformationList'][0]
            status = instance_info['PingStatus']
            print(f"Instance {instance_id} status: {status} (region: {region})")
            return status == 'Online'
        else:
            print(f"Instance {instance_id} not found in SSM (region: {region})")
            return False
            
    except botocore.exceptions.ClientError as e:
        print(f"AWS Error checking instance status: {str(e)}")
        return False
    except Exception as e:
        print(f"Error checking instance status: {str(e)}")
        return False

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/instances')
def get_instances():
    try:
        print("Loading instances from YAML...")
        with open('instances_list.yaml', 'r') as file:
            data = yaml.safe_load(file)
        
        print(f"Loaded YAML data: {data}")
        
        tree = []
        for customer, customer_data in data.items():
            customer_node = {
                'name': customer,
                'type': 'customer',
                'environments': []
            }
            
            if 'instances' in customer_data:
                environments = customer_data['instances']
                for env_name, instances in environments.items():
                    env_node = {
                        'name': env_name,
                        'type': 'environment',
                        'instances': []
                    }
                    
                    for instance in instances:
                        instance_node = {
                            'name': instance['name'],
                            'id': instance['instance_id'],
                            'type': 'instance'
                        }
                        env_node['instances'].append(instance_node)
                    
                    customer_node['environments'].append(env_node)
            
            tree.append(customer_node)
        
        return jsonify(tree)
    except Exception as e:
        print(f"Error loading instances: {str(e)}")
        return jsonify([])

@socketio.on('connect')
def handle_connect():
    # Just log the connection, don't start any sessions
    print('Client connected')

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')
    # Clean up any existing sessions for this client
    for session_id, session in list(sessions.items()):
        try:
            session.close()
            del sessions[session_id]
        except Exception as e:
            print(f'Error cleaning up session {session_id}: {e}')

@socketio.on('start_session')
def handle_start_session(data):
    instance_id = data.get('instance_id')
    session_id = data.get('session_id')
    
    if not instance_id or not session_id:
        emit('session_error', {'error': 'Invalid instance or session ID'})
        return

    try:
        session = SSMSession(instance_id, session_id)
        if session.start_session():
            sessions[session_id] = session
            emit('session_started', {
                'instance_id': instance_id,
                'session_id': session_id
            })
        else:
            emit('session_error', {
                'instance_id': instance_id,
                'session_id': session_id,
                'error': 'Failed to start session'
            })
    except Exception as e:
        emit('session_error', {
            'instance_id': instance_id,
            'session_id': session_id,
            'error': str(e)
        })

@socketio.on('terminal_input')
def handle_terminal_input(data):
    session_id = data.get('session_id')
    input_data = data.get('input')
    
    if not session_id or not input_data:
        return
        
    session = sessions.get(session_id)
    if session:
        session.write_input(input_data)

@socketio.on('terminal_interrupt')
def handle_terminal_interrupt(data):
    session_id = data.get('session_id')
    if session_id in sessions:
        session = sessions[session_id]
        # Send Ctrl+C signal to the process group
        if session.process:
            try:
                os.killpg(os.getpgid(session.process.pid), signal.SIGINT)
            except ProcessLookupError:
                pass

@socketio.on('terminal_resize')
def handle_terminal_resize(data):
    session_id = data.get('session_id')
    rows = data.get('rows')
    cols = data.get('cols')
    
    if not all([session_id, rows, cols]):
        return
        
    session = sessions.get(session_id)
    if session:
        session.resize_terminal(rows, cols)

@socketio.on('close_session')
def handle_close_session(data):
    session_id = data.get('session_id')
    if session_id in sessions:
        session = sessions[session_id]
        session.close()
        del sessions[session_id]

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=True, allow_unsafe_werkzeug=True)
