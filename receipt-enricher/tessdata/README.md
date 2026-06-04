# tessdata — offline Tesseract language data

Drop the English language data here so the offline OCR path works **without**
downloading from the jsdelivr CDN (which a corporate TLS proxy may block).

Place **either** of these in this directory:

- `eng.traineddata`     ← uncompressed (preferred — loaded straight from cache)
- `eng.traineddata.gz`  ← compressed (also fine — read locally, then unpacked)

Get the file from a network without TLS interception (e.g. Google Colab). The
matching asset for this project (tesseract.js 5.x, LSTM-only) is:

    https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz

See `../test/README.md` ("Corporate TLS proxy gotcha") for the Colab snippet and
the full story. Once the file is here:

    npm run test:live:tesseract     # should now OCR the sample instead of skipping

The code points Tesseract at this folder via `config.tessdataDir`
(override with the `TESSDATA_PATH` env var, e.g. a mounted volume in Docker).
