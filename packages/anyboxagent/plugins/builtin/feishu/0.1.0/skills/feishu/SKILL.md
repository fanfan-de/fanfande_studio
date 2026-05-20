---
name: Feishu
description: Use when the Feishu connector is connected and the user asks to search or inspect Feishu Drive files and Docx documents.
---

# Feishu

Use the Feishu connector tools for user-authorized Feishu data. Prefer read-only actions unless the user explicitly asks for edits and the connector exposes write tools.

- Use `feishu_profile` to verify which Feishu account is connected.
- Use `feishu_search_files` to find files by keyword.
- Use `feishu_read_docx_raw` to read plain text from a Docx document ID or URL.
