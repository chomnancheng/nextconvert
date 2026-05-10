# Tab By Paragraph Feature Integration (`paragraph-tab-feature.md`)

````md
# By Paragraph Tab Feature Integration

## Overview
This feature adds a new "Paragraph" tab into the existing Electron application.

Purpose:
- Import bulk paragraph/text content line-by-line
- Convert each line into a generated post
- Apply reusable templates from database
- Support HTML/special characters
- Use same processing flow as existing "By Images" tab
- Export generated results into selected output folder

---

# Database

## Recommended
- SQLite for Electron desktop app
- PostgreSQL if connected to remote/cloud backend

## Database Tables

### templates

Store reusable Facebook-story-like templates.

```sql
CREATE TABLE templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    profile_image TEXT,
    profile_name TEXT,
    post_date TEXT,
    post_text TEXT,
    read_more_text TEXT,
    comment_link TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
````

---

# UI Layout

## Main Layout

```text
---------------------------------------------------------
| Paragraph Input Area | Templates Sidebar             |
|                       |                               |
|                       | Template Card List            |
|                       | ----------------------------  |
|                       | Profile Image                 |
|                       | Profile Name                  |
|                       | Date                          |
|                       | Preview Text                  |
|                       | Read More                     |
|                       | Comment Link                  |
---------------------------------------------------------
```

---

# Right Sidebar — Templates List

## Data Source

Query templates from database.

```ts
SELECT * FROM templates ORDER BY created_at DESC;
```

## Template Card Structure

Each template should display:

* Profile image
* Profile name
* Date
* Short preview text
* "Read More"
* Comment link preview

## Features

### Template Selection

* Single select active template
* Highlight selected template

### Template CRUD

* Create template
* Edit template
* Delete template

---

# Paragraph Input Area

## Input Behavior

Textarea supports:

* Plain text
* HTML content
* Special characters
* Unicode
* Emojis

## Parsing Rule

Each line = 1 post

Example:

```text
First story paragraph here
Second story paragraph here
Third story paragraph here
```

Result:

* 3 generated posts

---

# Import Process

## Button: Import

After clicking import:

1. Read textarea content
2. Split by line break
3. Remove empty lines
4. Convert into queue list
5. Display list same as "By Images" tab

---

# HTML Support

Must support:

* HTML entities
* Encoded characters
* UTF-8
* Emojis

Example:

```html
Tom &amp; Jerry
```

Should render:

```text
Tom & Jerry
```

Recommended:

```ts
import { decode } from "html-entities";

const cleanText = decode(inputText);
```

---

# Queue Display

After import:

```text
[ ] Post #1
[ ] Post #2
[ ] Post #3
```

Should behave exactly like:

* Existing "By Images" processing list

---

# Convert Workflow

## Process

1. Select template
2. Import paragraph lines
3. Select output folder
4. Start convert
5. Generate posts
6. Save output

---

# Output Folder Requirement

## Validation

Before convert:

```ts
if (!outputFolder) {
   showError("Please select output folder");
   return;
}
```

Required:

* Must not allow convert without output folder

---

# Generated Output

Each generated item should contain:

* Template data
* Imported paragraph text
* Read more section
* Comment link

---

# Recommended Tech Stack

## Electron

* Electron + React
* BetterSQLite3 or sqlite3

## Database

* SQLite local mode
* PostgreSQL cloud mode

## State

* Zustand or Redux

## UI

* TailwindCSS
* Shadcn UI

---

# Suggested Folder Structure

```text
src/
 ├── features/
 │    ├── paragraph-tab/
 │    │    ├── components/
 │    │    ├── hooks/
 │    │    ├── services/
 │    │    ├── db/
 │    │    ├── parser/
 │    │    └── store/
```

---

# Suggested Components

## Components

### ParagraphTab.tsx

Main feature layout

### TemplateSidebar.tsx

Template list UI

### ParagraphInput.tsx

Textarea import area

### QueueList.tsx

Imported paragraph queue

### ConvertProgress.tsx

Conversion progress UI

---

# Conversion Logic

## Pseudo Flow

```ts
for (const item of paragraphQueue) {
   applyTemplate(selectedTemplate);
   generatePost(item.text);
   exportToFolder(outputFolder);
}
```

---

# Future Improvements

## Optional Features

### Auto Save Draft

Save imported text automatically

### Multi Template Rotation

Random template per post

### AI Rewrite

Rewrite paragraph before generate

### Schedule Posting

Queue for publishing later

### Import TXT/CSV

Bulk import from files

---

# Summary

This feature provides:

* Bulk paragraph importing
* Facebook-story-style template system
* HTML-safe text parsing
* Queue processing
* Shared conversion engine with existing image workflow
* Required output folder validation
* SQLite/PostgreSQL support

```
```
