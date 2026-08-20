"use client";

import React, { useState, useCallback, useContext } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { WorkspaceContext } from "@/hooks/useWorkspace";
import "./SearchPanel.css";

interface SearchResult {
  id: string;
  file_path: string;
  line_number: number;
  line: string;
}

interface SearchPanelProps {
  onResultClick: (file: string, line: number) => void;
}

export default function SearchPanel({ onResultClick }: SearchPanelProps) {
  const workspace = useContext(WorkspaceContext);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regex, setRegex] = useState(false);

  const handleSearch = useCallback(
    async (searchTerm: string) => {
      if (!searchTerm.trim() || !workspace?.currentWorkspace) {
        setResults([]);
        return;
      }

      setIsSearching(true);
      setQuery(searchTerm);

      try {
        const response = await invoke<any>("cmd_search", {
          workspace_path: workspace.currentWorkspace.path,
          pattern: searchTerm,
          include_patterns: null,
        });

        if (response.success && response.data) {
          const searchResults: SearchResult[] = response.data.map(
            (r: any, idx: number) => ({
              id: `result-${idx}`,
              file_path: r.file_path,
              line_number: r.line_number,
              line: r.line,
            })
          );
          setResults(searchResults);
        } else {
          setResults([]);
        }
      } catch (error) {
        console.error("Search failed:", error);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [workspace?.currentWorkspace]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch(e.currentTarget.value);
    }
  };

  return (
    <div className="search-panel">
      <div className="search-header">
        <div className="search-input-group">
          <input
            type="text"
            className="search-input"
            placeholder="Search files..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="search-button"
            onClick={() => handleSearch(query)}
          >
            {isSearching ? "Searching..." : "Search"}
          </button>
        </div>

        <div className="search-options">
          <button
            className={`option-button ${caseSensitive ? "active" : ""}`}
            title="Match Case"
            onClick={() => setCaseSensitive(!caseSensitive)}
          >
            Aa
          </button>
          <button
            className={`option-button ${wholeWord ? "active" : ""}`}
            title="Match Whole Word"
            onClick={() => setWholeWord(!wholeWord)}
          >
            ab
          </button>
          <button
            className={`option-button ${regex ? "active" : ""}`}
            title="Use Regular Expression"
            onClick={() => setRegex(!regex)}
          >
            .*
          </button>
        </div>
      </div>

      <div className="search-results">
        {results.length === 0 && query ? (
          <div className="no-results">No results for "{query}"</div>
        ) : results.length === 0 ? (
          <div className="empty-state">
            <p>Search across your workspace</p>
          </div>
        ) : (
          <div className="results-list">
            <div className="results-count">
              {results.length} result{results.length !== 1 ? "s" : ""}
            </div>
            {results.map((result) => (
              <div
                key={result.id}
                className="result-item"
                onClick={() =>
                  onResultClick(result.file_path, result.line_number)
                }
              >
                <div className="result-location">
                  <span className="file-name">{result.file_path}</span>
                  <span className="line-number">:{result.line_number}</span>
                </div>
                <div className="result-preview">
                  <code>{result.line}</code>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
