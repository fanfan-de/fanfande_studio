#!/bin/bash

source="/e/Project/opencode/packages/opencode"
dest="/e/Project/fanfande_studio/fanfande_studio_vault/opencode"

if [ ! -d "$source" ]; then
    echo "Source directory does not exist: $source"
    exit 1
fi

echo "Creating directory structure..."
find "$source" -type d | while read dir; do
    relpath="${dir#$source/}"
    if [ "$relpath" = "$dir" ]; then
        continue
    fi
    mkdir -p "$dest/$relpath"
done

echo "Creating empty .md files..."
find "$source" -type f | while read file; do
    relpath="${file#$source/}"
    if [ "$relpath" = "$file" ]; then
        continue
    fi
    destdir="$dest/$(dirname "$relpath")"
    mkdir -p "$destdir"
    filename=$(basename "$file")
    # Remove extension
    basename="${filename%.*}"
    # If basename is empty (e.g., .gitignore), keep original filename
    if [ -z "$basename" ]; then
        basename="$filename"
    fi
    newfile="$destdir/$basename.md"
    touch "$newfile"
done

echo "Done."