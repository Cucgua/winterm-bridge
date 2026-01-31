package email

import (
	"crypto/tls"
	"fmt"
	"log"
	"net"
	"net/smtp"
	"strings"

	"winterm-bridge/internal/config"
)

// Sender handles email notifications
type Sender struct {
	config *config.EmailConfig
}

// NewSender creates a new email sender
func NewSender() *Sender {
	return &Sender{}
}

// UpdateConfig updates the email configuration
func (s *Sender) UpdateConfig(cfg *config.EmailConfig) {
	s.config = cfg
}

// GetConfig returns the current email configuration
func (s *Sender) GetConfig() *config.EmailConfig {
	if s.config == nil {
		return &config.EmailConfig{}
	}
	return s.config
}

// IsEnabled returns whether email sending is enabled and properly configured
func (s *Sender) IsEnabled() bool {
	if s.config == nil {
		return false
	}
	return s.config.Enabled &&
		s.config.SMTPHost != "" &&
		s.config.ToAddress != ""
}

// SendNotification sends a notification email for a session state change
func (s *Sender) SendNotification(sessionTitle, sessionID, tag, description string) error {
	if !s.IsEnabled() {
		return fmt.Errorf("email not configured")
	}

	subject := fmt.Sprintf("[WinTerm] %s - %s", sessionTitle, tag)
	body := fmt.Sprintf(`会话状态通知

会话: %s
状态: %s
描述: %s

会话ID: %s

---
此邮件由 WinTerm-Bridge 自动发送
`, sessionTitle, tag, description, sessionID)

	return s.send(subject, body)
}

// send sends an email with the given subject and body
func (s *Sender) send(subject, body string) error {
	if s.config == nil {
		return fmt.Errorf("email not configured")
	}

	from := s.config.FromAddress
	if from == "" {
		from = s.config.Username
	}

	to := s.config.ToAddress
	host := s.config.SMTPHost
	port := s.config.SMTPPort
	if port == 0 {
		port = 587
	}

	// Construct email message
	msg := fmt.Sprintf("From: %s\r\n"+
		"To: %s\r\n"+
		"Subject: %s\r\n"+
		"Content-Type: text/plain; charset=UTF-8\r\n"+
		"\r\n"+
		"%s", from, to, subject, body)

	addr := fmt.Sprintf("%s:%d", host, port)

	// Use SSL for port 465, STARTTLS for others
	var err error
	if port == 465 {
		err = s.sendWithSSL(addr, host, from, to, msg)
	} else {
		err = s.sendWithSTARTTLS(addr, host, from, to, msg)
	}

	if err != nil {
		log.Printf("[Email] Failed to send: %v", err)
		return err
	}

	log.Printf("[Email] Notification sent to %s: %s", to, subject)
	return nil
}

// sendWithSSL sends email using direct SSL connection (port 465)
func (s *Sender) sendWithSSL(addr, host, from, to, msg string) error {
	// Create TLS connection
	tlsConfig := &tls.Config{
		ServerName: host,
	}

	conn, err := tls.Dial("tcp", addr, tlsConfig)
	if err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return fmt.Errorf("failed to create SMTP client: %w", err)
	}
	defer client.Close()

	// Authenticate
	if s.config.Username != "" && s.config.Password != "" {
		auth := smtp.PlainAuth("", s.config.Username, s.config.Password, host)
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("authentication failed: %w", err)
		}
	}

	// Set sender and recipient
	if err := client.Mail(from); err != nil {
		return fmt.Errorf("MAIL FROM failed: %w", err)
	}

	for _, rcpt := range strings.Split(to, ",") {
		rcpt = strings.TrimSpace(rcpt)
		if err := client.Rcpt(rcpt); err != nil {
			return fmt.Errorf("RCPT TO failed: %w", err)
		}
	}

	// Send message body
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("DATA failed: %w", err)
	}

	_, err = w.Write([]byte(msg))
	if err != nil {
		return fmt.Errorf("failed to write message: %w", err)
	}

	err = w.Close()
	if err != nil {
		return fmt.Errorf("failed to close writer: %w", err)
	}

	return client.Quit()
}

// sendWithSTARTTLS sends email using STARTTLS (port 25, 587)
func (s *Sender) sendWithSTARTTLS(addr, host, from, to, msg string) error {
	// Connect
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return fmt.Errorf("failed to create SMTP client: %w", err)
	}
	defer client.Close()

	// Try STARTTLS if available
	if ok, _ := client.Extension("STARTTLS"); ok {
		tlsConfig := &tls.Config{ServerName: host}
		if err := client.StartTLS(tlsConfig); err != nil {
			return fmt.Errorf("STARTTLS failed: %w", err)
		}
	}

	// Authenticate
	if s.config.Username != "" && s.config.Password != "" {
		auth := smtp.PlainAuth("", s.config.Username, s.config.Password, host)
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("authentication failed: %w", err)
		}
	}

	// Set sender and recipient
	if err := client.Mail(from); err != nil {
		return fmt.Errorf("MAIL FROM failed: %w", err)
	}

	for _, rcpt := range strings.Split(to, ",") {
		rcpt = strings.TrimSpace(rcpt)
		if err := client.Rcpt(rcpt); err != nil {
			return fmt.Errorf("RCPT TO failed: %w", err)
		}
	}

	// Send message body
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("DATA failed: %w", err)
	}

	_, err = w.Write([]byte(msg))
	if err != nil {
		return fmt.Errorf("failed to write message: %w", err)
	}

	err = w.Close()
	if err != nil {
		return fmt.Errorf("failed to close writer: %w", err)
	}

	return client.Quit()
}

// Test tests the email configuration by sending a test email
func (s *Sender) Test() error {
	if s.config == nil {
		return fmt.Errorf("email not configured")
	}

	return s.send("WinTerm 邮件测试", "这是一封测试邮件，如果您收到此邮件，说明邮件配置正确。")
}
