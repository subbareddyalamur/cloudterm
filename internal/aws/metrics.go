package aws

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"
)

type InstanceMetrics struct {
	CPULoad     float64 `json:"cpu_load"`
	CPUCount    int     `json:"cpu_count"`
	MemUsedPct  float64 `json:"mem_used_pct"`
	MemTotalMB  int     `json:"mem_total_mb"`
	MemUsedMB   int     `json:"mem_used_mb"`
	DiskUsedPct float64 `json:"disk_used_pct"`
	DiskTotalGB float64 `json:"disk_total_gb"`
	DiskUsedGB  float64 `json:"disk_used_gb"`
	Uptime      string  `json:"uptime"`
}

func (d *Discovery) GetInstanceMetrics(profile, region, instanceID, platform string) (*InstanceMetrics, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	client, err := d.newSSMClient(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	isWin := strings.EqualFold(platform, "windows")
	docName := "AWS-RunShellScript"
	if isWin {
		docName = "AWS-RunPowerShellScript"
	}

	var cmd string
	if isWin {
		cmd = "$cpu=(Get-WmiObject Win32_Processor|Measure-Object -Property LoadPercentage -Average).Average;" +
			"$os=Get-WmiObject Win32_OperatingSystem;" +
			"$memTotal=[math]::Round($os.TotalVisibleMemorySize/1024);" +
			"$memUsed=$memTotal-[math]::Round($os.FreePhysicalMemory/1024);" +
			"$memPct=[math]::Round(($memUsed/$memTotal)*100,1);" +
			"$disk=Get-WmiObject Win32_LogicalDisk -Filter \"DeviceID='C:'\";" +
			"$diskTotal=[math]::Round($disk.Size/1GB,1);" +
			"$diskUsed=[math]::Round(($disk.Size-$disk.FreeSpace)/1GB,1);" +
			"$diskPct=[math]::Round((($disk.Size-$disk.FreeSpace)/$disk.Size)*100,1);" +
			"$uptime=(Get-Date)-(Get-CimInstance Win32_OperatingSystem).LastBootUpTime;" +
			"$uptimeStr=\"$($uptime.Days)d $($uptime.Hours)h $($uptime.Minutes)m\";" +
			"$cpuCount=(Get-WmiObject Win32_Processor).NumberOfLogicalProcessors;" +
			"\"CPU:$cpu|CPUS:$cpuCount|MEMPCT:$memPct|MEMTOT:$memTotal|MEMUSED:$memUsed|DISKPCT:$diskPct|DISKTOT:$diskTotal|DISKUSED:$diskUsed|UPTIME:$uptimeStr\""
	} else {
		cmd = `LOAD=$(awk '{print $1}' /proc/loadavg);` +
			`CPUS=$(nproc 2>/dev/null || echo 1);` +
			`eval $(free -m | awk '/^Mem:/{printf "MEMUSED=%d MEMTOT=%d MEMPCT=%.1f",$3,$2,$3/$2*100}');` +
			`eval $(df -BG / | awk 'NR==2{gsub("G","");printf "DISKUSED=%s DISKTOT=%s DISKPCT=%.1f",$3,$2,$5}');` +
			`UPTIME=$(uptime -p 2>/dev/null || uptime | sed 's/.*up/up/');` +
			`echo "CPU:${LOAD}|CPUS:${CPUS}|MEMPCT:${MEMPCT}|MEMTOT:${MEMTOT}|MEMUSED:${MEMUSED}|DISKPCT:${DISKPCT}|DISKTOT:${DISKTOT}|DISKUSED:${DISKUSED}|UPTIME:${UPTIME}"`
	}

	out, err := ssmExecOutput(ctx, client, instanceID, cmd, docName)
	if err != nil {
		return nil, fmt.Errorf("metrics command failed: %w", err)
	}

	return parseMetrics(strings.TrimSpace(out), isWin)
}

func parseMetrics(raw string, _ bool) (*InstanceMetrics, error) {
	m := &InstanceMetrics{}
	parts := strings.Split(raw, "|")
	kv := make(map[string]string)
	for _, p := range parts {
		idx := strings.Index(p, ":")
		if idx > 0 {
			kv[p[:idx]] = p[idx+1:]
		}
	}

	m.CPULoad, _ = strconv.ParseFloat(kv["CPU"], 64)
	m.CPUCount, _ = strconv.Atoi(kv["CPUS"])
	m.MemUsedPct, _ = strconv.ParseFloat(kv["MEMPCT"], 64)
	m.MemTotalMB, _ = strconv.Atoi(kv["MEMTOT"])
	m.MemUsedMB, _ = strconv.Atoi(kv["MEMUSED"])
	m.DiskUsedPct, _ = strconv.ParseFloat(kv["DISKPCT"], 64)
	m.DiskTotalGB, _ = strconv.ParseFloat(kv["DISKTOT"], 64)
	m.DiskUsedGB, _ = strconv.ParseFloat(kv["DISKUSED"], 64)
	m.Uptime = kv["UPTIME"]

	return m, nil
}
