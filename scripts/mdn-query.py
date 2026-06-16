#!/usr/bin/env python3
import sys
import urllib.parse
import webbrowser


def query_mdn(query):
    # Clean query for MDN search URL
    clean_query = "".join([c for c in query if c.isalnum() or c in "_-+"])
    search_url = f"https://developer.mozilla.org/en-US/search?q=reference+{clean_query}"

    # GitHub search for MDN content
    encoded_query = urllib.parse.quote(query)
    github_url = f"https://github.com/search?q=repo%3Amdn%2Fcontent+{encoded_query}"

    print(f"MDN Search: {search_url}")
    print(f"GitHub Content Search: {github_url}")

    # Open in browser if requested (default is just print)
    if len(sys.argv) > 2 and sys.argv[2] == "--open":
        webbrowser.open(search_url)
        webbrowser.open(github_url)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: mdn-query <query> [--open]")
        sys.exit(1)
    query_mdn(sys.argv[1])
