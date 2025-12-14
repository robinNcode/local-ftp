package handlers

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"local-ftp/config"
	//"local-ftp/utils"
)

func Download(w http.ResponseWriter, r *http.Request) {
	filename := strings.TrimPrefix(r.URL.Path, "/api/download/")
	path := filepath.Join(config.UploadDir, filename)

	w.Header().Set("Content-Disposition", "attachment; filename="+filename)
	http.ServeFile(w, r, path)
}

func DownloadMultiple(w http.ResponseWriter, r *http.Request) {
	var req struct{ Files []string `json:"files"` }
	json.NewDecoder(r.Body).Decode(&req)

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition",
		fmt.Sprintf("attachment; filename=download_%s.zip", time.Now().Format("20060102_150405")))

	zipWriter := zip.NewWriter(w)
	defer zipWriter.Close()

	for _, name := range req.Files {
		file, _ := os.Open(filepath.Join(config.UploadDir, name))
		writer, _ := zipWriter.Create(name)
		io.Copy(writer, file)
		file.Close()
	}
}
