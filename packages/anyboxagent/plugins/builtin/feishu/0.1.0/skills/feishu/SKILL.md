---
name: Feishu
description: Use when the Feishu connector is connected and the user asks to search or inspect Feishu Drive, Docx, Wiki, Sheets, or Bitable content.
---

# Feishu

Use the Feishu connector tools for user-authorized Feishu data. Prefer read-only actions unless the user explicitly asks for edits and the connector exposes write tools.

- Use `feishu_profile` to verify which Feishu account is connected.
- Use `feishu_search_files` to find files by keyword.
- Use `feishu_get_file_metadata` to inspect Drive metadata for known tokens.
- Use `feishu_read_docx_raw` to read plain text from a Docx document ID or URL.
- Use `feishu_list_docx_blocks` when structured Docx block data is needed.
- Use `feishu_list_wiki_spaces`, `feishu_get_wiki_node`, and `feishu_list_wiki_nodes` for Wiki navigation.
- Use `feishu_read_sheet_values` to read spreadsheet ranges.
- Use `feishu_list_bitable_records` to inspect Bitable table records.
