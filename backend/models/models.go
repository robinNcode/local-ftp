package models

import "time"

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
