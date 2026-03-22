package suggest

import "unicode/utf8"

// StripANSI removes ANSI escape sequences from terminal output.
func StripANSI(data []byte) []byte {
	out := make([]byte, 0, len(data))
	i := 0
	for i < len(data) {
		if data[i] == 0x1b {
			i++
			if i >= len(data) {
				break
			}
			switch data[i] {
			case '[':
				i++
				for i < len(data) && !((data[i] >= 0x40 && data[i] <= 0x7e) && data[i] != '[') {
					i++
				}
				if i < len(data) {
					i++
				}
			case ']':
				i++
				for i < len(data) {
					if data[i] == 0x07 {
						i++
						break
					}
					if data[i] == 0x1b && i+1 < len(data) && data[i+1] == '\\' {
						i += 2
						break
					}
					i++
				}
			case '(', ')', '*', '+':
				i++
				if i < len(data) {
					i++
				}
			default:
				i++
			}
			continue
		}
		if data[i] < 0x20 && data[i] != '\n' && data[i] != '\r' && data[i] != '\t' {
			i++
			continue
		}
		if !utf8.Valid(data[i : i+1]) {
			_, size := utf8.DecodeRune(data[i:])
			if size > 0 {
				out = append(out, data[i:i+size]...)
				i += size
			} else {
				i++
			}
			continue
		}
		out = append(out, data[i])
		i++
	}
	return out
}
