package ttyd

import (
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	readTimeout  = 2 * time.Minute
	writeTimeout = 10 * time.Second
)

// ProxyWS bidirectionally proxies WebSocket messages between client and ttyd
func ProxyWS(client *websocket.Conn, targetURL string) error {
	// ttyd requires "tty" subprotocol
	dialer := websocket.Dialer{
		Subprotocols: []string{"tty"},
	}
	header := http.Header{}
	ttydConn, _, err := dialer.Dial(targetURL, header)
	if err != nil {
		return err
	}
	defer ttydConn.Close()

	// Set up read deadlines and pong handlers for keepalive
	_ = client.SetReadDeadline(time.Now().Add(readTimeout))
	_ = ttydConn.SetReadDeadline(time.Now().Add(readTimeout))

	client.SetPongHandler(func(string) error {
		return client.SetReadDeadline(time.Now().Add(readTimeout))
	})
	ttydConn.SetPongHandler(func(string) error {
		return ttydConn.SetReadDeadline(time.Now().Add(readTimeout))
	})

	var closeOnce sync.Once
	closeBoth := func() {
		closeOnce.Do(func() {
			_ = ttydConn.Close()
			_ = client.Close()
		})
	}

	errCh := make(chan error, 2)

	// Client → ttyd
	go func() {
		for {
			mt, data, err := client.ReadMessage()
			if err != nil {
				errCh <- err
				closeBoth()
				return
			}
			_ = ttydConn.SetWriteDeadline(time.Now().Add(writeTimeout))
			if err := ttydConn.WriteMessage(mt, data); err != nil {
				errCh <- err
				closeBoth()
				return
			}
			// Reset read deadline on activity
			_ = client.SetReadDeadline(time.Now().Add(readTimeout))
		}
	}()

	// ttyd → Client
	go func() {
		for {
			mt, data, err := ttydConn.ReadMessage()
			if err != nil {
				errCh <- err
				closeBoth()
				return
			}
			_ = client.SetWriteDeadline(time.Now().Add(writeTimeout))
			if err := client.WriteMessage(mt, data); err != nil {
				errCh <- err
				closeBoth()
				return
			}
			// Reset read deadline on activity
			_ = ttydConn.SetReadDeadline(time.Now().Add(readTimeout))
		}
	}()

	err = <-errCh
	if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
		log.Printf("[ttyd] Proxy closed normally")
		return nil
	}
	return err
}
