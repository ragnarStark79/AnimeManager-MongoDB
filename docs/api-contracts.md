# AnimeManager — REST API Contracts

**Document Version:** 1.3
**Base Path:** `/api/v1`
**Status:** Core APIs, Jikan Importer, and Exports Implemented (Phases 01, 02, 03, & 05)
**Implementation State:** Health, Titles, Collections, Bookmarks, Jikan/Tenrai Importer, and Exports Implemented; Direct Cover URLs with responsive glassmorphism poster fallback

---

## 1. Response Formats & Error Conventions

All API responses use consistent JSON envelope structures.

### 1.1 Single Item Success Envelope
```json
{
  "data": { ... },
  "meta": {
    "requestId": "req_abc123456",
    "timestamp": "2026-10-14T14:55:00Z"
  }
}
```

### 1.2 Paginated List Success Envelope
```json
{
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "pageSize": 24,
    "total": 128,
    "totalPages": 6
  },
  "meta": {
    "requestId": "req_abc123456",
    "timestamp": "2026-10-14T14:55:00Z"
  }
}
```

### 1.3 Error Envelope
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The provided payload failed schema validation.",
    "details": [
      {
        "field": "englishTitle",
        "message": "Title cannot be blank."
      }
    ]
  },
  "meta": {
    "requestId": "req_abc123456",
    "timestamp": "2026-10-14T14:55:00Z"
  }
}
```

### 1.4 Standard HTTP Status Codes & Error Codes
| HTTP Status | Error Code | Description |
|---|---|---|
| 200 OK | - | Successful GET, PATCH, or PUT request. |
| 201 Created | - | Resource successfully created. |
| 204 No Content | - | Successful DELETE request. |
| 400 Bad Request | `BAD_REQUEST`, `MALFORMED_INPUT`, `CONFIRMATION_REQUIRED` | Unparseable syntax, invalid URL/ID params, or unconfirmed deletion. |
| 401 Unauthorized | `UNAUTHORIZED` | Missing or invalid authentication token. |
| 403 Forbidden | `FORBIDDEN` | Caller lacks permission for this resource. |
| 404 Not Found | `NOT_FOUND` | Resource does not exist or is not owned by user. |
| 409 Conflict | `CONFLICT`, `DUPLICATE_RESOURCE`, `DUPLICATE_IMPORT` | Resource already exists (duplicate collection name, or duplicate imported external MAL ID). |
| 422 Unprocessable | `VALIDATION_ERROR` | Schema validation error on payload. |
| 429 Too Many Requests| `RATE_LIMITED` | Exceeded rate limit thresholds or upstream Jikan rate limit. |
| 502 Bad Gateway | `EXTERNAL_PROVIDER_UNAVAILABLE`| Jikan API failed, returned 503, or is unreachable after retries. |
| 504 Gateway Timeout | `EXTERNAL_PROVIDER_TIMEOUT` | Jikan API did not respond within request timeout window (10s). |
| 500 Server Error | `INTERNAL_ERROR` | Unhandled error; details kept server-side. |

---

## 2. Health & System

### `GET /api/v1/health`
Checks API service health and database connectivity.

- **Authentication:** Public
- **Response 200 OK:**
```json
{
  "data": {
    "status": "healthy",
    "database": "connected",
    "version": "1.0.0",
    "uptime": 12450.5
  },
  "meta": { "requestId": "req_health_1" }
}
```

---

## 3. Titles

### `GET /api/v1/titles`
Query and list titles with filtering, search, and pagination.

- **Query Parameters:**
  - `page` (integer, default: 1)
  - `pageSize` (integer, default: 24, max: 100)
  - `search` (string, optional, searches english_title, original_title, aliases)
  - `mediaType` (enum: `anime` | `manga` | `manhwa`, optional)
  - `collectionId` (UUID, optional)
  - `bookmarkStatus` (enum: `plan_to_consume` | `consuming` | `completed` | `on_hold` | `dropped`, optional)
  - `sortBy` (enum: `title` | `createdAt` | `updatedAt` | `releaseYear` | `personalRating`, default: `updatedAt`)
  - `sortOrder` (enum: `asc` | `desc`, default: `desc`)

- **Response 200 OK:** Paginated list of Title summary objects.

### `POST /api/v1/titles`
Create a title manually.

- **Request Body:**
```json
{
  "mediaType": "anime",
  "englishTitle": "Frieren: Beyond Journey's End",
  "originalTitle": "葬送のフリーレン",
  "aliases": [
    { "title": "Sousou no Frieren", "aliasType": "romanized", "languageCode": "ja" }
  ],
  "synopsis": "An elf mage examines the passage of time...",
  "background": "Based on the award-winning manga.",
  "coverUrl": "https://example.com/cover.jpg",
  "coverSourceType": "url",
  "releaseYear": 2023,
  "publicationStatus": "Finished Airing",
  "startDate": "2023-09-29",
  "endDate": "2024-03-22",
  "episodeCount": 28,
  "chapterCount": null,
  "genres": ["Adventure", "Drama", "Fantasy"],
  "tags": ["Elves", "Magic", "Melancholy"]
}
```
- **Response 201 Created:** Full created Title object with generated UUID.

### `GET /api/v1/titles/:id`
Retrieve full title details including aliases, genres, tags, collection memberships, external source mappings, and attached bookmark (if one exists).

- **Response 200 OK:** Full Title detail object.
- **Response 404 Not Found:** Title ID not found.

### `PATCH /api/v1/titles/:id`
Partially update title metadata.

- **Request Body:** Any subset of mutable title fields.
- **Response 200 OK:** Updated Title object.

### `DELETE /api/v1/titles/:id`
Permanently delete title and its relationships (aliases, tags, collection memberships, bookmark, external sources) via database cascade.

- **Query Parameters:**
  - `confirm` (string, required): Must be `"true"` to execute deletion.
- **Response 204 No Content:** Successfully deleted.
- **Response 400 Bad Request:** If `confirm=true` is missing or false:
```json
{
  "error": {
    "code": "CONFIRMATION_REQUIRED",
    "message": "Title deletion requires explicit confirmation (?confirm=true)"
  },
  "meta": { "requestId": "req_del_1" }
}
```
- **Response 404 Not Found:** If title does not exist or belongs to another owner.

---

## 4. Collections (My List)

### `GET /api/v1/collections`
List all user collections with title count summaries.

- **Response 200 OK:**
```json
{
  "data": [
    {
      "id": "c1a9c148-1122-4a5c-9c3a-86714db254cb",
      "name": "Masterpieces",
      "description": "Top-tier favorites with immaculate storytelling",
      "coverUrl": "https://...",
      "icon": "star",
      "color": "#38bdf8",
      "sortMode": "custom",
      "titleCount": 14,
      "createdAt": "2026-10-14T10:00:00Z",
      "updatedAt": "2026-10-14T10:00:00Z"
    }
  ],
  "meta": { "requestId": "req_col_list" }
}
```

### `POST /api/v1/collections`
Create a new collection.

- **Request Body:**
```json
{
  "name": "Chill Fantasy",
  "description": "Slow life and comforting atmosphere",
  "icon": "coffee",
  "color": "#38bdf8",
  "sortMode": "date_added"
}
```
- **Validation:** `name` must be non-empty, trimmed, and case-insensitively unique for the owner.
- **Response 201 Created:** Collection object.
- **Response 409 Conflict:** Collection with identical name already exists.

### `GET /api/v1/collections/:id`
Retrieve collection metadata and list of titles in the collection.

### `PATCH /api/v1/collections/:id`
Update collection metadata (name, description, color, sortMode).

### `DELETE /api/v1/collections/:id`
Delete collection.
*Note: Title records are never deleted when a collection is removed; only the link in `title_collections` is removed.*

### `POST /api/v1/collections/:id/titles`
Add one or more titles to a collection.

- **Request Body:**
```json
{
  "titleIds": ["550e8400-e29b-41d4-a716-446655440000"]
}
```
- **Response 200 OK:** Updated collection membership count.

### `DELETE /api/v1/collections/:id/titles/:titleId`
Remove a single title from a collection.

- **Response 204 No Content.**

### `PATCH /api/v1/collections/:id/order`
Update custom display order of titles in a collection.

- **Request Body:**
```json
{
  "order": [
    { "titleId": "550e8400-e29b-41d4-a716-446655440000", "position": 1 },
    { "titleId": "770e8400-e29b-41d4-a716-446655440001", "position": 2 }
  ]
}
```
- **Response 200 OK.**

---

## 5. Bookmarks (Tracking)

### `GET /api/v1/bookmarks`
List tracking bookmarks with status and media type filters.

- **Query Parameters:**
  - `status` (`plan_to_consume`, `consuming`, `completed`, `on_hold`, `dropped`)
  - `mediaType` (`anime`, `manga`, `manhwa`)
  - `page`, `pageSize`, `sortBy`, `sortOrder`

- **Response 200 OK:** Paginated list of bookmarks joined with core title data (title, cover, counts).

### `POST /api/v1/bookmarks`
Create a bookmark for a title.

- **Request Body:**
```json
{
  "titleId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "consuming",
  "progress": 12,
  "progressUnit": "episode",
  "progressTotal": 28,
  "priority": 4,
  "personalRating": 9.5,
  "notes": "Incredible animation in episode 9.",
  "startedAt": "2026-10-01"
}
```
- **Validation Rules:**
  - `progress >= 0`.
  - `personalRating` between `0.0` and `10.0`.
  - Only one bookmark per `(owner_id, title_id)`.
- **Response 201 Created.**
- **Response 409 Conflict:** Bookmark already exists for this title.

### `PATCH /api/v1/bookmarks/:id`
Update tracking progress, status, rating, or notes.

- **Request Body:** Subset of mutable bookmark fields.
- **Response 200 OK.**

### `DELETE /api/v1/bookmarks/:id`
Delete bookmark tracking record.
*Note: The underlying title record is preserved.*

- **Response 204 No Content.**

### `PUT /api/v1/titles/:titleId/bookmark`
Convenience endpoint to upsert (create or update) the bookmark associated with a title.

- **Response 200 OK.**

---

## 6. Jikan Import & Metadata Normalization

### `GET /api/v1/import/jikan/search`
Search MyAnimeList via the resilient server-side Jikan client.

- **Authentication:** Required (`Bearer <JWT>`)
- **Query Parameters:**
  - `q` (string, required, length 2–100 chars): Search keyword.
  - `mediaType` (enum: `anime` | `manga`, required): Media catalog to query.
  - `page` (integer, default: 1, min: 1, max: 100): Result page number.
- **Upstream Handling:** Outbound request to `https://api.jikan.moe/v4/{anime|manga}?q={q}&page={page}&limit=20`. Inter-request throttling and 10-minute in-memory caching applied.
- **Response 200 OK:**
```json
{
  "data": [
    {
      "malId": 52991,
      "url": "https://myanimelist.net/anime/52991/Sousou_no_Frieren",
      "imageUrl": "https://cdn.myanimelist.net/images/anime/1015/138006l.jpg",
      "englishTitle": "Frieren: Beyond Journey's End",
      "originalTitle": "葬送のフリーレン",
      "mediaType": "anime",
      "sourceType": "TV",
      "episodes": 28,
      "chapters": null,
      "volumes": null,
      "score": 9.38,
      "rank": 1,
      "status": "Finished Airing",
      "synopsis": "During their decade-long quest..."
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req_import_search_1",
    "timestamp": "2026-10-14T19:00:00Z"
  }
}
```
- **Error Responses:**
  - `400 BAD_REQUEST`: Missing or invalid query parameters (e.g. `q` too short, invalid `mediaType`).
  - `429 RATE_LIMITED`: Upstream rate limit encountered and retries exhausted.
  - `502 EXTERNAL_PROVIDER_UNAVAILABLE`: Upstream Jikan failure or 503 unavailable.
  - `504 EXTERNAL_PROVIDER_TIMEOUT`: Jikan did not respond within 10 seconds.

---

### `GET /api/v1/import/preview`
Fetch full metadata for a MyAnimeList title by URL or numeric ID + mediaType, returning an editable normalized draft. Does **NOT** mutate the database.

- **Authentication:** Required (`Bearer <JWT>`)
- **Query Parameters (one of two forms required):**
  - Form 1 (URL):
    - `url` (string, required): Supported forms:
      - `https://myanimelist.net/anime/{id}`
      - `https://myanimelist.net/manga/{id}`
      - With optional slug: `https://myanimelist.net/anime/{id}/Sousou_no_Frieren`
  - Form 2 (ID + mediaType):
    - `id` (integer, positive): MAL ID.
    - `mediaType` (enum: `anime` | `manga`).
- **Security & SSRF Safeguards:**
  - Parsed via strict URL parser. Hostname must be strictly `myanimelist.net`. Protocol must be `https:`. No user/password, default port only.
  - Outbound requests construct URLs exclusively from fixed base `https://api.jikan.moe/v4/{mediaType}/{id}/full`.
  - Client-supplied URLs are **never** passed to HTTP fetch. Automatic redirects are disabled (`redirect: 'error'`).
- **Duplicate Detection:**
  - Checks if `external_sources` already has a record for `(provider = 'myanimelist', external_id = malId)` belonging to the authenticated user.
  - If found, `duplicateExistingTitleId` contains the existing title UUID; otherwise `null`.
- **Manga vs. Manhwa Disambiguation:**
  - If upstream type is explicitly `"Manhwa"`, sets `mediaType: "manhwa"`.
  - If ambiguous manga type, includes `warnings: ["Source classified as manga..."]` and sets `needsMediaConfirmation: true`.
- **Response 200 OK:**
```json
{
  "data": {
    "provider": "myanimelist",
    "externalId": "52991",
    "sourceUrl": "https://myanimelist.net/anime/52991/Sousou_no_Frieren",
    "mediaType": "anime",
    "englishTitle": "Frieren: Beyond Journey's End",
    "originalTitle": "葬送のフリーレン",
    "aliases": [
      { "title": "Sousou no Frieren", "aliasType": "romanized", "languageCode": "ja" }
    ],
    "synopsis": "During their decade-long quest...",
    "background": "Based on the manga...",
    "coverUrl": "https://cdn.myanimelist.net/images/anime/1015/138006l.jpg",
    "releaseYear": 2023,
    "publicationStatus": "Finished Airing",
    "startDate": "2023-09-29",
    "endDate": "2024-03-22",
    "episodeCount": 28,
    "chapterCount": null,
    "sourceScore": 9.38,
    "sourceRank": 1,
    "sourcePopularity": 234,
    "genres": ["Adventure", "Drama", "Fantasy"],
    "tags": ["Elves", "Magic"],
    "warnings": [],
    "needsMediaConfirmation": false,
    "duplicateExistingTitleId": null,
    "sourceRetrievedAt": "2026-10-14T19:00:00Z"
  },
  "meta": {
    "requestId": "req_preview_1",
    "timestamp": "2026-10-14T19:00:00Z"
  }
}
```

---

### `POST /api/v1/import/commit`
Atomically commit a user-reviewed import draft into local PostgreSQL tables (`titles`, `title_aliases`, `title_genres`, `title_tags`, `external_sources`, and optionally `bookmarks` and `title_collections`).

- **Authentication:** Required (`Bearer <JWT>`)
- **Server-Side Enforcement Rules:**
  - **Field Selection:** Only fields marked `true` in `selectedFields` (or explicitly provided in `overrides`) are persisted. Unselected fields default to `null` or empty arrays. Client drafts cannot force unselected fields into the database.
  - **Owner Scoping:** The `owner_id` is derived strictly from the verified JWT.
  - **Duplicate Prevention:** If `external_sources` already has `(myanimelist, externalId)` for this user, returns `409 DUPLICATE_IMPORT` with the existing title ID without creating any new record.
  - **Atomicity:** All table inserts occur in a single `db.transaction()`. If any step fails (e.g. invalid collection ID), the entire transaction rolls back.
  - **Review Exclusion:** Community reviews are completely absent from draft schemas and cannot be persisted.
- **Request Body (`ImportCommitInput`):**
```json
{
  "draft": {
    "provider": "myanimelist",
    "externalId": "52991",
    "sourceUrl": "https://myanimelist.net/anime/52991/Sousou_no_Frieren",
    "mediaType": "anime",
    "englishTitle": "Frieren: Beyond Journey's End",
    "originalTitle": "葬送のフリーレン",
    "aliases": [
      { "title": "Sousou no Frieren", "aliasType": "romanized", "languageCode": "ja" }
    ],
    "synopsis": "During their decade-long quest...",
    "background": "Based on manga.",
    "coverUrl": "https://cdn.myanimelist.net/images/anime/1015/138006l.jpg",
    "releaseYear": 2023,
    "publicationStatus": "Finished Airing",
    "startDate": "2023-09-29",
    "endDate": "2024-03-22",
    "episodeCount": 28,
    "chapterCount": null,
    "sourceScore": 9.38,
    "sourceRank": 1,
    "sourcePopularity": 234,
    "genres": ["Adventure", "Drama", "Fantasy"],
    "tags": ["Elves", "Magic"],
    "sourceRetrievedAt": "2026-10-14T19:00:00Z"
  },
  "selectedFields": {
    "englishTitle": true,
    "originalTitle": true,
    "synopsis": true,
    "background": false,
    "coverUrl": true,
    "genres": true,
    "tags": true,
    "aliases": true,
    "dates": true,
    "counts": true,
    "sourceMetrics": true
  },
  "overrides": {
    "englishTitle": "Frieren: Beyond Journey's End (Custom)"
  },
  "confirmedMediaType": "anime",
  "initialBookmark": {
    "status": "plan_to_consume",
    "priority": 4
  },
  "collectionIds": ["c1a9c148-1122-4a5c-9c3a-86714db254cb"]
}
```
- **Response 201 Created:** Full created Title object with attached relationships.
```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "ownerId": "00000000-0000-0000-0000-000000000001",
    "mediaType": "anime",
    "englishTitle": "Frieren: Beyond Journey's End (Custom)",
    "originalTitle": "葬送のフリーレン",
    "synopsis": "During their decade-long quest...",
    "background": null,
    "coverUrl": "https://cdn.myanimelist.net/images/anime/1015/138006l.jpg",
    "coverSourceType": "provider",
    "releaseYear": 2023,
    "publicationStatus": "Finished Airing",
    "startDate": "2023-09-29",
    "endDate": "2024-03-22",
    "episodeCount": 28,
    "chapterCount": null,
    "sourceScore": 9.38,
    "sourceRank": 1,
    "sourcePopularity": 234,
    "aliases": [ ... ],
    "genres": ["Adventure", "Drama", "Fantasy"],
    "tags": ["Elves", "Magic"],
    "externalSources": [
      {
        "provider": "myanimelist",
        "externalId": "52991",
        "sourceUrl": "https://myanimelist.net/anime/52991/Sousou_no_Frieren"
      }
    ],
    "bookmark": {
      "status": "plan_to_consume",
      "progress": 0,
      "priority": 4
    },
    "createdAt": "2026-10-14T19:05:00Z",
    "updatedAt": "2026-10-14T19:05:00Z"
  },
  "meta": {
    "requestId": "req_commit_1",
    "timestamp": "2026-10-14T19:05:00Z"
  }
}
```
- **Response 409 Conflict (`DUPLICATE_IMPORT`):**
```json
{
  "error": {
    "code": "DUPLICATE_IMPORT",
    "message": "Title from myanimelist with ID 52991 already exists in your library.",
    "details": {
      "existingTitleId": "550e8400-e29b-41d4-a716-446655440000",
      "provider": "myanimelist",
      "externalId": "52991"
    }
  },
  "meta": {
    "requestId": "req_commit_dup_1"
  }
}
```

---

## 7. Cover Image Uploads

### `POST /api/v1/uploads/covers`
Upload custom cover image.

- **Content-Type:** `multipart/form-data`
- **File Constraints:**
  - Max size: 5 MB
  - Allowed types: `image/jpeg`, `image/png`, `image/webp`
- **Response 201 Created:**
```json
{
  "data": {
    "storagePath": "covers/user_1/550e8400_abc.webp",
    "publicUrl": "https://storage.example.com/covers/user_1/550e8400_abc.webp"
  },
  "meta": { "requestId": "req_upload_1" }
}
```

---

## 8. Data Export & Backup

### `GET /api/v1/export/json`
Full relational JSON backup including all titles, aliases, collections, memberships, bookmarks, genres, tags, and source mappings.

- **Content-Type:** `application/json`
- **Content-Disposition:** `attachment; filename="animemanager_backup_YYYY-MM-DD.json"`

### `GET /api/v1/export/csv`
Flat tabular export of titles with bookmark status, progress, and collection names.

- **Content-Type:** `text/csv`
- **Content-Disposition:** `attachment; filename="animemanager_titles_YYYY-MM-DD.csv"`
