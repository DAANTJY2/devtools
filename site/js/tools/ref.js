import { memo } from '../lib/memo.js';

memo({
  id: 'linuxcmd', cat: 'ref', ic: '$_', name: 'Linux commands',
  desc: 'Everyday commands for files, processes, networking, disks and logs.',
  kw: 'linux command cheatsheet cheat sheet bash terminal shell ubuntu debian',
  sections: {
    'Files and directories': [['ls -lah', 'Contents with details, including hidden files'], ['cd -', 'Back to the previous directory'], ['cp -a source dest', 'Copy, preserving permissions and times'], ['mv old new', 'Move or rename'], ['rm -ri dir', 'Remove a directory, with confirmation'], ['mkdir -p a/b/c', 'Create directories, including intermediate ones'], ['find / -name "*.log" -mtime -1', 'Find files modified in the last 24 hours'], ['du -sh * | sort -h', 'Size per directory, sorted'], ['tar czf archive.tgz dir/', 'Pack a directory'], ['tar xzf archive.tgz', 'Unpack an archive'], ['ln -s target link', 'Create a symbolic link'], ['stat file', 'All properties of a file']],
    'Viewing and searching text': [['less file', 'Page through (q to quit, / to search)'], ['tail -f /var/log/syslog', 'Follow a log live'], ['grep -rni "text" dir/', 'Search recursively, case-insensitive, with line numbers'], ['grep -v "^#" config | grep .', 'Config without comments and empty lines'], ['wc -l file', 'Count lines'], ['sort | uniq -c | sort -rn', 'Count how often lines occur'], ['awk \'{print $1}\' file', 'Show the first column'], ['sed -i \'s/old/new/g\' file', 'Replace text in a file'], ['diff -u a b', 'Compare two files']],
    'Permissions and users': [['chmod 640 file', 'Set permissions (see the chmod calculator)'], ['chown -R user:group dir', 'Change the owner recursively'], ['sudo -i', 'Open a root shell'], ['id', 'Your user and group IDs'], ['sudo useradd -m -s /bin/bash name', 'Create a user with a home directory'], ['sudo usermod -aG group name', 'Add a user to a group'], ['passwd', 'Change your password']],
    'Processes and services': [['htop', 'View processes interactively'], ['ps aux | grep name', 'Find a process'], ['kill -15 PID', 'Stop a process gracefully (-9 forces it)'], ['systemctl status service', 'Status of a service'], ['sudo systemctl restart service', 'Restart a service'], ['sudo systemctl enable --now service', 'Enable and start a service'], ['journalctl -u service -f', 'Follow the logs of a service'], ['journalctl -p err -b', 'Errors since the last boot'], ['nohup cmd &', 'Keep a command running after logging out']],
    'Network': [['ip -br a', 'IP addresses per interface'], ['ip r', 'Routing table'], ['ss -tulpn', 'Listening ports with process'], ['ping -c 4 host', 'Test reachability'], ['traceroute host', 'Route to a host'], ['dig +short example.com', 'DNS lookup'], ['dig MX example.com @1.1.1.1', 'MX records via a specific DNS server'], ['curl -I https://example.com', 'HTTP headers only'], ['curl -sS -o /dev/null -w "%{http_code}\\n" URL', 'Only the status code'], ['nc -zv host 443', 'Test whether a port is open']],
    'Disks': [['df -h', 'Free space per file system'], ['lsblk -f', 'Disks and partitions with file systems'], ['sudo blkid', 'UUIDs of partitions (for fstab)'], ['sudo mount -a', 'Mount everything in fstab'], ['sudo smartctl -a /dev/sda', 'Health of a disk (SMART)'], ['ncdu /', 'See interactively what takes up space']],
    'System': [['uname -a', 'Kernel and architecture'], ['cat /etc/os-release', 'Which distribution and version'], ['uptime', 'How long it has been running and the load'], ['free -h', 'Memory usage'], ['sudo apt update && sudo apt upgrade', 'Update packages (Debian/Ubuntu)'], ['sudo dnf upgrade', 'Update packages (Fedora/RHEL)'], ['timedatectl', 'Time, time zone and NTP status'], ['crontab -e', 'Edit scheduled tasks']],
  },
});

memo({
  id: 'dockercmd', cat: 'ref', ic: '🐳', name: 'Docker commands',
  desc: 'Containers, images, volumes, networks and Compose.',
  kw: 'docker command cheatsheet cheat sheet container image compose volume',
  sections: {
    'Containers': [['docker ps -a', 'All containers, including stopped ones'], ['docker run -d --name web -p 8080:80 nginx', 'Start a container in the background'], ['docker exec -it web sh', 'Shell into a running container'], ['docker logs -f --tail 100 web', 'Follow the latest logs'], ['docker stop web && docker rm web', 'Stop and remove'], ['docker restart web', 'Restart'], ['docker inspect web', 'All details as JSON'], ['docker stats', 'Live CPU and memory usage'], ['docker cp web:/path/file .', 'Copy a file out of a container']],
    'Images': [['docker images', 'Local images'], ['docker pull image:tag', 'Pull an image'], ['docker build -t name:tag .', 'Build an image from the Dockerfile in this directory'], ['docker tag name:tag registry/name:tag', 'Give an image an extra name'], ['docker push registry/name:tag', 'Upload an image'], ['docker rmi image', 'Remove an image'], ['docker history image', 'Layers of an image']],
    'Compose': [['docker compose up -d', 'Start everything in the background'], ['docker compose down', 'Stop everything and remove the containers'], ['docker compose pull && docker compose up -d', 'Update to new images'], ['docker compose logs -f service', 'Logs of one service'], ['docker compose ps', 'Status of the services'], ['docker compose exec service sh', 'Shell into a service'], ['docker compose config', 'Show the final configuration (with .env applied)'], ['docker compose run --rm service cmd', 'Run a one-off command']],
    'Volumes and networks': [['docker volume ls', 'List volumes'], ['docker volume inspect name', 'Where a volume is stored'], ['docker network ls', 'List networks'], ['docker network create network', 'Create a network'], ['docker network connect network web', 'Connect a container to a network']],
    'Cleaning up': [['docker system df', 'How much space Docker uses'], ['docker system prune', 'Remove stopped containers, unused networks and dangling images'], ['docker image prune -a', 'Remove all unused images'], ['docker volume prune', 'Remove unused volumes (careful: data!)'], ['docker builder prune', 'Clear the build cache']],
  },
});

memo({
  id: 'wincmd', cat: 'ref', ic: 'WIN', name: 'Windows commands',
  desc: 'Networking, system and administration from the command line (cmd plus some PowerShell equivalents).',
  kw: 'windows command cmd cheatsheet cheat sheet network ipconfig administration',
  sections: {
    'Network': [['ipconfig /all', 'All network settings'], ['ipconfig /flushdns', 'Flush the DNS cache'], ['ipconfig /release && ipconfig /renew', 'Get a new IP address via DHCP'], ['ping -t host', 'Ping continuously (Ctrl+C stops)'], ['tracert host', 'Route to a host'], ['nslookup example.com 1.1.1.1', 'DNS lookup against a specific server'], ['netstat -ano | findstr :443', 'Who is listening on port 443 (with PID)'], ['Test-NetConnection host -Port 443', 'Test a port (PowerShell)'], ['netsh wlan show profiles', 'Saved Wi-Fi networks'], ['netsh wlan show profile name key=clear', 'Show a Wi-Fi password'], ['route print', 'Routing table'], ['arp -a', 'ARP table']],
    'System': [['systeminfo', 'System overview'], ['winver', 'Windows version'], ['sfc /scannow', 'Check and repair system files'], ['DISM /Online /Cleanup-Image /RestoreHealth', 'Repair the Windows image'], ['chkdsk C: /f', 'Check a disk (at restart)'], ['shutdown /r /t 0', 'Restart immediately'], ['shutdown /s /t 3600', 'Shut down in an hour'], ['tasklist | findstr name', 'Find a process'], ['taskkill /F /IM name.exe', 'Force-stop a process'], ['powercfg /batteryreport', 'Create a battery report']],
    'Administration': [['gpupdate /force', 'Apply Group Policy immediately'], ['gpresult /r', 'Which Group Policy applies'], ['whoami /groups', 'Your groups and privileges'], ['net user name', 'Details of a user'], ['net localgroup administrators', 'Local administrators'], ['winget upgrade --all', 'Update all programs'], ['wmic bios get serialnumber', 'Serial number (deprecated; see PowerShell)'], ['mstsc /v:host', 'Open Remote Desktop'], ['eventvwr.msc', 'Open Event Viewer']],
  },
});

memo({
  id: 'pscmd', cat: 'ref', ic: 'PS>', name: 'PowerShell cheat sheet',
  desc: 'PowerShell for everyday administration: filtering objects, files, services, networking and remoting.',
  kw: 'powershell ps cheatsheet cheat sheet cmdlet get-help where-object windows administration',
  sections: {
    'Basics': [['Get-Help Get-Process -Examples', 'Examples for a cmdlet'], ['Get-Command *service*', 'Find cmdlets'], ['Get-Process | Get-Member', 'Which properties an object has'], ['$PSVersionTable', 'PowerShell version'], ['Set-ExecutionPolicy RemoteSigned -Scope CurrentUser', 'Allow local scripts']],
    'Filtering and sorting': [['Get-Process | Where-Object CPU -gt 100', 'Filter by property'], ['Get-Service | Where-Object Status -eq Running', 'Only running services'], ['Get-ChildItem | Sort-Object Length -Descending | Select-Object -First 10', 'Ten largest files'], ['... | Select-Object Name, Id', 'Only certain columns'], ['... | Format-Table -AutoSize', 'Show as a table'], ['... | Export-Csv out.csv -NoTypeInformation', 'To CSV'], ['... | ConvertTo-Json -Depth 5', 'To JSON'], ['... | Measure-Object -Sum Length', 'Sum up']],
    'Files': [['Get-ChildItem -Recurse -Filter *.log', 'Find files'], ['Get-Content file.log -Tail 50 -Wait', 'Follow a log (like tail -f)'], ['Select-String -Path *.txt -Pattern "error"', 'Search in files (like grep)'], ['Copy-Item source dest -Recurse', 'Copy'], ['Remove-Item dir -Recurse -Force', 'Delete'], ['Get-FileHash file -Algorithm SHA256', 'Compute a checksum'], ['Compress-Archive dir out.zip', 'Create a zip']],
    'Services and processes': [['Get-Service name', 'Status of a service'], ['Restart-Service name', 'Restart a service'], ['Set-Service name -StartupType Automatic', 'Start automatically'], ['Stop-Process -Name name -Force', 'Stop a process'], ['Get-EventLog -LogName System -Newest 20', 'Latest system events'], ['Get-WinEvent -FilterHashtable @{LogName="System"; Level=2} -MaxEvents 20', 'Latest errors']],
    'Network': [['Get-NetIPAddress -AddressFamily IPv4', 'IP addresses'], ['Test-NetConnection host -Port 443', 'Test a port'], ['Resolve-DnsName example.com -Type MX', 'DNS lookup'], ['Get-NetTCPConnection -State Listen', 'Listening ports'], ['Invoke-WebRequest https://example.com -UseBasicParsing', 'Fetch a web page'], ['Invoke-RestMethod https://api.example.com/x', 'Call an API; JSON becomes an object']],
    'System and administration': [['Get-ComputerInfo', 'System overview'], ['Get-CimInstance Win32_BIOS | Select SerialNumber', 'Serial number'], ['Get-HotFix | Sort InstalledOn -Desc', 'Installed updates'], ['Get-LocalUser', 'Local users'], ['Restart-Computer -Force', 'Restart'], ['Enter-PSSession -ComputerName server', 'Work remotely (remoting)'], ['Invoke-Command -ComputerName s1,s2 { hostname }', 'Run a command on several servers']],
  },
});

memo({
  id: 'sshcmd', cat: 'ref', ic: 'SSH', name: 'SSH and keys',
  desc: 'Connecting, tunnels, keys, file transfer and the config file.',
  kw: 'ssh key tunnel scp sftp config cheatsheet cheat sheet ssh-keygen port forwarding',
  sections: {
    'Connecting': [['ssh user@host', 'Connect'], ['ssh -p 2222 user@host', 'Different port'], ['ssh -J jumphost targethost', 'Via a jump host'], ['ssh host "uptime"', 'Run a single command'], ['ssh -v host', 'Verbose output for troubleshooting'], ['~.', 'Kill a frozen session (after Enter)']],
    'Keys': [['ssh-keygen -t ed25519 -C "you@laptop"', 'Create a new key (recommended type)'], ['ssh-copy-id user@host', 'Install your public key on a server'], ['ssh-add ~/.ssh/id_ed25519', 'Add a key to the agent'], ['ssh-keygen -lf ~/.ssh/id_ed25519.pub', 'Fingerprint of a key'], ['ssh-keygen -R host', 'Remove an old host key from known_hosts'], ['ssh-keygen -p -f ~/.ssh/id_ed25519', 'Change the passphrase of a key'], ['chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys', 'Correct permissions (otherwise SSH refuses)']],
    'Tunnels': [['ssh -L 8080:localhost:80 host', 'Local port 8080 to port 80 on the server'], ['ssh -L 5432:db.internal:5432 host', 'Through the server to an internal database'], ['ssh -R 9000:localhost:3000 host', 'Server port 9000 to your port 3000'], ['ssh -D 1080 host', 'SOCKS proxy through the server'], ['ssh -fN -L ...', 'Tunnel in the background, without a shell']],
    'Files': [['scp file host:/path/', 'Copy a file to the server'], ['scp -r host:/dir .', 'Fetch a directory'], ['sftp host', 'Transfer files interactively'], ['rsync -avz dir/ host:/dest/', 'Synchronize (see the rsync tool)'], ['sshfs host:/path /mnt/point', 'Mount a remote directory']],
    'Config (~/.ssh/config)': [['Host nas\n  HostName 192.168.1.10\n  User admin\n  Port 2222', 'Shortcut: then simply “ssh nas”'], ['  IdentityFile ~/.ssh/id_nas', 'Use a specific key'], ['  ProxyJump bastion', 'Always go through a jump host'], ['  ServerAliveInterval 60', 'Keep the connection alive'], ['  ForwardAgent no', 'Do not forward the agent (safer)']],
    'Securing the server (/etc/ssh/sshd_config)': [['PasswordAuthentication no', 'Key-based login only'], ['PermitRootLogin no', 'Root may not log in directly'], ['AllowUsers admin', 'Only specific users'], ['sudo sshd -t && sudo systemctl reload ssh', 'Test and reload the config (keep your session open!)']],
  },
});
