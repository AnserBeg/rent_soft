# Aiven Support Agent MVP

This is a minimal AI support-agent app for the documentation ZIP structure created earlier:

- `Aiven_Rental_App_User_Manual_with_image_references.md`
- `screenshot_index.json` or `screenshot_index.csv`
- `screenshots/` folder

It lets you upload that ZIP, indexes the manual text and screenshot metadata into an OpenAI vector store, serves screenshots locally, asks OpenAI for grounded answers using `file_search`, and uses vision + Sharp to draw an annotation around the relevant UI target.

## 1. Install

```bash
npm install
cp .env.example .env
```

Add your OpenAI API key to `.env`:

```bash
OPENAI_API_KEY=sk-your-key
```

## 2. Run

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## 3. Use

1. Upload the ZIP file containing the manual, screenshot index, and screenshot folder.
2. Wait for indexing.
3. Ask a question like:
   - How do I create a rental order?
   - Where do I add a fee?
   - How do I add an asset?
   - How do I use booked dates?
4. The app returns written steps and an annotated screenshot when the model selects one.

## How it works

Runtime flow:

```text
ZIP upload
  -> extract manual + screenshots + screenshot_index
  -> upload manual text + normalized screenshot index to OpenAI vector store
  -> user asks question
  -> local screenshot index finds candidate images
  -> Responses API uses file_search to answer from manual
  -> model chooses screenshot + target label
  -> vision model estimates bounding box
  -> Sharp draws annotation
  -> frontend displays answer + image
```

## Production improvements

For production, do these next:

1. Store screenshots in S3/Supabase/Cloudinary instead of local disk.
2. Store manifests in Postgres instead of `data/manuals.json`.
3. Add login and tenant isolation.
4. Pre-label important button coordinates in `screenshot_index.json` to avoid needing vision localization every time.
5. Add manual versioning so customers get help for their exact app version.
6. Add admin review before publishing a new manual.
7. Add citations/sources in the UI by rendering `file_search_call.results` from the Responses API.

## Important limitation

If your `screenshot_index.json` does not contain exact bounding boxes, the app asks a vision model to estimate the target location. This works for an MVP, but exact production-grade circles should come from stored coordinates, DOM metadata, or manually verified bounding boxes.


## Screenshot toggle

The chat UI includes an **Include annotated screenshots** checkbox.

- On: the backend sends screenshot candidates to the model, may call the vision model, and may return an annotated image.
- Off: the backend sends an empty screenshot candidate list, instructs the model to return text only, skips vision/annotation, and returns no image.

This lowers token usage and latency for questions where visual help is not needed.
