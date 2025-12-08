package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	uploadDir = "./uploads"
	port      = "6061"
)

type FileInfo struct {
	Name         string    `json:"name"`
	Size         int64     `json:"size"`
	ModifiedTime time.Time `json:"modifiedTime"`
	IsDir        bool      `json:"isDir"`
}

type Response struct {
	Success bool        `json:"success"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

func main() {
	// Create uploads directory if it doesn't exist
	if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
		log.Fatal("Failed to create uploads directory:", err)
	}

	// Setup routes
	http.HandleFunc("/api/files", corsMiddleware(listFilesHandler))
	http.HandleFunc("/api/upload", corsMiddleware(uploadHandler))
	http.HandleFunc("/api/download/", corsMiddleware(downloadHandler))
	http.HandleFunc("/api/delete/", corsMiddleware(deleteHandler))

	// Get local IP
	localIP := getLocalIP()
	
	fmt.Printf("\n===========================================\n")
	fmt.Printf("  Local FTP Server Started\n")
	fmt.Printf("===========================================\n")
	fmt.Printf("  Local Access:   http://localhost:%s\n", port)
	fmt.Printf("  Network Access: http://%s:%s\n", localIP, port)
	fmt.Printf("  Upload Dir:     %s\n", uploadDir)
	fmt.Printf("===========================================\n\n")

	log.Fatal(http.ListenAndServe(":"+port, nil))
}

// CORS middleware
func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}

// List all files
func listFilesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	files, err := os.ReadDir(uploadDir)
	if err != nil {
		sendError(w, "Failed to read directory", http.StatusInternalServerError)
		return
	}

	fileList := []FileInfo{}
	for _, file := range files {
		info, err := file.Info()
		if err != nil {
			continue
		}

		fileList = append(fileList, FileInfo{
			Name:         file.Name(),
			Size:         info.Size(),
			ModifiedTime: info.ModTime(),
			IsDir:        file.IsDir(),
		})
	}

	sendSuccess(w, "Files retrieved successfully", fileList)
}

// Upload file
func uploadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse multipart form (32MB max)
	err := r.ParseMultipartForm(32 << 20)
	if err != nil {
		sendError(w, "Failed to parse form", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		sendError(w, "Failed to get file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Create file
	filename := filepath.Base(header.Filename)
	dst, err := os.Create(filepath.Join(uploadDir, filename))
	if err != nil {
		sendError(w, "Failed to create file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	// Copy file content
	_, err = io.Copy(dst, file)
	if err != nil {
		sendError(w, "Failed to save file", http.StatusInternalServerError)
		return
	}

	log.Printf("File uploaded: %s (%d bytes)\n", filename, header.Size)
	sendSuccess(w, "File uploaded successfully", map[string]string{"filename": filename})
}

// Download file
func downloadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	filename := strings.TrimPrefix(r.URL.Path, "/api/download/")
	if filename == "" {
		sendError(w, "Filename is required", http.StatusBadRequest)
		return
	}

	filePath := filepath.Join(uploadDir, filename)

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		sendError(w, "File not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Disposition", "attachment; filename="+filename)
	w.Header().Set("Content-Type", "application/octet-stream")
	http.ServeFile(w, r, filePath)
	log.Printf("File downloaded: %s\n", filename)
}

// Delete file
func deleteHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		sendError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	filename := strings.TrimPrefix(r.URL.Path, "/api/delete/")
	if filename == "" {
		sendError(w, "Filename is required", http.StatusBadRequest)
		return
	}

	filePath := filepath.Join(uploadDir, filename)

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		sendError(w, "File not found", http.StatusNotFound)
		return
	}

	// Delete file
	err := os.Remove(filePath)
	if err != nil {
		sendError(w, "Failed to delete file", http.StatusInternalServerError)
		return
	}

	log.Printf("File deleted: %s\n", filename)
	sendSuccess(w, "File deleted successfully", nil)
}

// Get local IP address
func getLocalIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "localhost"
	}

	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				return ipnet.IP.String()
			}
		}
	}
	return "localhost"
}

// Helper functions
func sendSuccess(w http.ResponseWriter, message string, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(Response{
		Success: true,
		Message: message,
		Data:    data,
	})
}

func sendError(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(Response{
		Success: false,
		Message: message,
	})
}