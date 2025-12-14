package utils

import (
	"archive/zip"
	"io"
	"mime/multipart"
	"os"
)

func CreateZipFromMultipart(files []*multipart.FileHeader, zipPath string) error {
	zipFile, err := os.Create(zipPath)
	if err != nil {
		return err
	}
	defer zipFile.Close()

	zipWriter := zip.NewWriter(zipFile)
	defer zipWriter.Close()

	for _, fh := range files {
		file, err := fh.Open()
		if err != nil {
			continue
		}

		writer, err := zipWriter.Create(fh.Filename)
		if err != nil {
			file.Close()
			continue
		}

		io.Copy(writer, file)
		file.Close()
	}

	return nil
}
