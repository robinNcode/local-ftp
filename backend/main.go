package main

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
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
	maxMemory = 500 << 20 // 500MB max memory for multipart form
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

type UploadZipRequest struct {
	FileCount int    `json:"fileCount"`
	Message   string `json:"message"`
}

func main() {
	// Create uploads directory if it doesn't exist
	if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
		log.Fatal("Failed to create uploads directory:", err)
	}

	// Setup routes
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		fmt.Fprintln(w, "The local-ftp server is running successfully!")
	})

	// API endpoints
	http.HandleFunc("/api/files", corsMiddleware(listFilesHandler))
	http.HandleFunc("/api/upload", corsMiddleware(uploadHandler))
	http.HandleFunc("/api/upload-multiple", corsMiddleware(uploadMultipleHandler))
	http.HandleFunc("/api/upload-zip", corsMiddleware(uploadZipHandler))
	http.HandleFunc("/api/download/", corsMiddleware(downloadHandler))
	http.HandleFunc("/api/download-multiple", corsMiddleware(downloadMultipleHandler))
	http.HandleFunc("/api/delete/", corsMiddleware(deleteHandler))

	// Get local IP
	localIP := getLocalIP()

	fmt.Printf("\n===========================================\n")
	fmt.Printf("  Local FTP Server Started\n")
	fmt.Printf("===========================================\n")
	fmt.Printf("  Local Access:   http://192.168.0.103:%s\n", port)
	fmt.Printf("  Network Access: http://%s:%s\n", localIP, port)
	fmt.Printf("  Upload Dir:     %s\n", uploadDir)
	fmt.Printf("  Max Files:      500 (auto-zip if exceeded)\n")
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

// List all files with metadata
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

// Upload single file
func uploadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	err := r.ParseMultipartForm(maxMemory)
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

	// Sanitize filename
	filename := filepath.Base(header.Filename)
	dst, err := os.Create(filepath.Join(uploadDir, filename))
	if err != nil {
		sendError(w, "Failed to create file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	_, err = io.Copy(dst, file)
	if err != nil {
		sendError(w, "Failed to save file", http.StatusInternalServerError)
		return
	}

	log.Printf("✓ File uploaded: %s (%d bytes)\n", filename, header.Size)
	sendSuccess(w, "File uploaded successfully", map[string]string{"filename": filename})
}

// Upload multiple files
func uploadMultipleHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	err := r.ParseMultipartForm(maxMemory)
	if err != nil {
		sendError(w, "Failed to parse form", http.StatusBadRequest)
		return
	}

	files := r.MultipartForm.File["files"]
	if len(files) == 0 {
		sendError(w, "No files uploaded", http.StatusBadRequest)
		return
	}

	// If more than 500 files, auto-compress
	if len(files) > 500 {
		log.Printf("⚠ More than 500 files detected (%d), creating zip archive...\n", len(files))
		zipFilename := fmt.Sprintf("bulk_upload_%s.zip", time.Now().Format("20060102_150405"))
		zipPath := filepath.Join(uploadDir, zipFilename)

		if err := createZipFromMultipart(files, zipPath); err != nil {
			sendError(w, "Failed to create zip archive", http.StatusInternalServerError)
			return
		}

		log.Printf("✓ Zip archive created: %s (%d files)\n", zipFilename, len(files))
		sendSuccess(w, fmt.Sprintf("Files compressed into %s", zipFilename), map[string]interface{}{
			"filename":  zipFilename,
			"fileCount": len(files),
		})
		return
	}

	// Upload files normally
	uploadedCount := 0
	failedFiles := []string{}

	for _, fileHeader := range files {
		file, err := fileHeader.Open()
		if err != nil {
			failedFiles = append(failedFiles, fileHeader.Filename)
			continue
		}

		filename := filepath.Base(fileHeader.Filename)
		dst, err := os.Create(filepath.Join(uploadDir, filename))
		if err != nil {
			file.Close()
			failedFiles = append(failedFiles, fileHeader.Filename)
			continue
		}

		_, err = io.Copy(dst, file)
		file.Close()
		dst.Close()

		if err != nil {
			failedFiles = append(failedFiles, fileHeader.Filename)
			continue
		}

		uploadedCount++
		log.Printf("✓ Uploaded: %s (%d bytes)\n", filename, fileHeader.Size)
	}

	message := fmt.Sprintf("Uploaded %d/%d files successfully", uploadedCount, len(files))
	sendSuccess(w, message, map[string]interface{}{
		"uploaded": uploadedCount,
		"total":    len(files),
		"failed":   failedFiles,
	})
}

// Handle zip upload notification
func uploadZipHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req UploadZipRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, "Invalid request", http.StatusBadRequest)
		return
	}

	log.Printf("⚠ Zip upload requested for %d files: %s\n", req.FileCount, req.Message)
	sendSuccess(w, "Zip upload notification received", nil)
}

// Create zip from multipart files
func createZipFromMultipart(files []*multipart.FileHeader, zipPath string) error {
	zipFile, err := os.Create(zipPath)
	if err != nil {
		return err
	}
	defer zipFile.Close()

	zipWriter := zip.NewWriter(zipFile)
	defer zipWriter.Close()

	for _, fileHeader := range files {
		file, err := fileHeader.Open()
		if err != nil {
			continue
		}

		writer, err := zipWriter.Create(fileHeader.Filename)
		if err != nil {
			file.Close()
			continue
		}

		_, err = io.Copy(writer, file)
		file.Close()
		if err != nil {
			continue
		}
	}

	return nil
}

// Download single file
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

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		sendError(w, "File not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Disposition", "attachment; filename="+filename)
	w.Header().Set("Content-Type", "application/octet-stream")
	http.ServeFile(w, r, filePath)
	log.Printf("⬇ File downloaded: %s\n", filename)
}

// Download multiple files as zip
func downloadMultipleHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Files []string `json:"files"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if len(req.Files) == 0 {
		sendError(w, "No files specified", http.StatusBadRequest)
		return
	}

	// Create zip in memory
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=download_%s.zip", time.Now().Format("20060102_150405")))

	zipWriter := zip.NewWriter(w)
	defer zipWriter.Close()

	for _, filename := range req.Files {
		filePath := filepath.Join(uploadDir, filename)

		if _, err := os.Stat(filePath); os.IsNotExist(err) {
			continue
		}

		file, err := os.Open(filePath)
		if err != nil {
			continue
		}

		writer, err := zipWriter.Create(filename)
		if err != nil {
			file.Close()
			continue
		}

		_, err = io.Copy(writer, file)
		file.Close()
		if err != nil {
			continue
		}
	}

	log.Printf("⬇ Downloaded %d files as zip\n", len(req.Files))
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

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		sendError(w, "File not found", http.StatusNotFound)
		return
	}

	err := os.Remove(filePath)
	if err != nil {
		sendError(w, "Failed to delete file", http.StatusInternalServerError)
		return
	}

	log.Printf("🗑 File deleted: %s\n", filename)
	sendSuccess(w, "File deleted successfully", nil)
}

// Get local IP address
func getLocalIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "192.168.0.103"
	}

	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				return ipnet.IP.String()
			}
		}
	}
	return "192.168.0.103"
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