package utils

import "net"

/**
 * GetLocalIP returns the machine's local LAN IPv4 address.
 *
 * The function:
 * - Iterates over active network interfaces
 * - Skips loopback and inactive interfaces
 * - Returns the first private IPv4 address (192.168.x.x, 10.x.x.x, 172.16–31.x.x)
 *
 * @return string
 */
func GetLocalIP() string {
	interfaces, err := net.Interfaces()
	if err != nil {
		return ""
	}

	for _, iface := range interfaces {
		// Skip down or loopback interfaces
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		for _, addr := range addrs {
			ipNet, ok := addr.(*net.IPNet)
			if !ok {
				continue
			}

			ip := ipNet.IP.To4()
			if ip == nil {
				continue
			}

			if isPrivateIPv4(ip) {
				return ip.String()
			}
		}
	}

	return ""
}

/**
 * isPrivateIPv4 checks whether an IP belongs to a private IPv4 range.
 *
 * @param ip net.IP
 * @return bool
 */
func isPrivateIPv4(ip net.IP) bool {
	switch {
	case ip[0] == 10:
		return true
	case ip[0] == 172 && ip[1] >= 16 && ip[1] <= 31:
		return true
	case ip[0] == 192 && ip[1] == 168:
		return true
	default:
		return false
	}
}