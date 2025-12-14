package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"local-ftp/config"
	"local-ftp/models"
	"local-ftp/utils"
)

func Upload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		utils.SendError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	r.ParseMultipartForm(config.MaxMemory)
	file, header, err := r.FormFile("file")
	if err != nil {
		utils.SendError(w, "Failed to get file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	filename := filepath.Base(header.Filename)
	dst, _ := os.Create(filepath.Join(config.UploadDir, filename))
	defer dst.Close()

	io.Copy(dst, file)
	log.Printf("✓ File uploaded: %s\n", filename)

	utils.SendSuccess(w, "File uploaded", filename)
}

func UploadMultiple(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		utils.SendError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	r.ParseMultipartForm(config.MaxMemory)
	files := r.MultipartForm.File["files"]

	if len(files) > 500 {
		zipName := fmt.Sprintf("bulk_%s.zip", time.Now().Format("20060102_150405"))
		utils.CreateZipFromMultipart(files, filepath.Join(config.UploadDir, zipName))
		utils.SendSuccess(w, "Files compressed", zipName)
		return
	}

	for _, f := range files {
		file, _ := f.Open()
		dst, _ := os.Create(filepath.Join(config.UploadDir, f.Filename))
		io.Copy(dst, file)
		file.Close()
		dst.Close()
	}

	utils.SendSuccess(w, "Files uploaded", len(files))
}

func UploadZipNotice(w http.ResponseWriter, r *http.Request) {
	var req models.UploadZipRequest
	json.NewDecoder(r.Body).Decode(&req)
	utils.SendSuccess(w, "Zip upload notification received", req)
}
