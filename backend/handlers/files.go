package handlers

import (
	"local-ftp/config"
	"local-ftp/utils"
	"net/http"
	"os"
	"time"
)
var uploadDir = config.UploadDir

type FileInfo struct {
	Name         string    `json:"name"`
	Size         int64     `json:"size"`
	ModifiedTime time.Time `json:"modifiedTime"`
	IsDir        bool      `json:"isDir"`
}

// List all files with metadata
func ListFilesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		utils.SendError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	files, err := os.ReadDir(uploadDir)
	if err != nil {
		utils.SendError(w, "Failed to read directory", http.StatusInternalServerError)
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

	utils.SendSuccess(w, "Files retrieved successfully", fileList)
}