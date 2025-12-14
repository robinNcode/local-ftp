package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"local-ftp/config"
	"local-ftp/handlers"
	"local-ftp/middleware"
	"local-ftp/utils"
)

func main() {
	os.MkdirAll(config.UploadDir, os.ModePerm)

	http.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprintln(w, "Local FTP Server Running")
	})

	http.HandleFunc("/api/files", middleware.CORS(handlers.ListFilesHandler))
	http.HandleFunc("/api/upload", middleware.CORS(handlers.Upload))
	http.HandleFunc("/api/upload-multiple", middleware.CORS(handlers.UploadMultiple))
	http.HandleFunc("/api/upload-zip", middleware.CORS(handlers.UploadZipNotice))
	http.HandleFunc("/api/download/", middleware.CORS(handlers.Download))
	http.HandleFunc("/api/download-multiple", middleware.CORS(handlers.DownloadMultiple))
	http.HandleFunc("/api/delete/", middleware.CORS(handlers.Delete))

	fmt.Printf("Server running at http://%s:%s\n", utils.GetLocalIP(), config.Port)
	log.Fatal(http.ListenAndServe(":"+config.Port, nil))
}
