package handlers

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"local-ftp/config"
	"local-ftp/utils"
)

func Delete(w http.ResponseWriter, r *http.Request) {
	filename := strings.TrimPrefix(r.URL.Path, "/api/delete/")
	err := os.Remove(filepath.Join(config.UploadDir, filename))
	if err != nil {
		utils.SendError(w, "File not found", http.StatusNotFound)
		return
	}
	utils.SendSuccess(w, "File deleted", nil)
}
