"use client";

import React, { useState, useCallback } from "react";
import "./SearchPanel.css";

interface SearchResult {
  id: string;
  file: string;
  line: number;
  column: number;
  preview: string;
  lineText: string;
}

interface SearchPanelProps {
  onResultClick: (file: string, line: number, column: number) => void;
}

export default function SearchPanel({ onResultClick }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regex, setRegex] = useState(false);

  const handleSearch = useCallback(
    (searchTerm: string) => {
      if (!searchTerm.trim()) {
        setResults([]);
        return;
      }

      setIsSearching(true);
      setQuery(searchTerm);

      // Mock search results
      const mockResults: SearchResult[] = [
        {
          id: "result-1",
          file: "src/recovery.rs",
          line: 42,
          column: 5,
          preview: "pub struct RecoveryOrchestrator {",
          lineText: "pub struct RecoveryOrchestrator {",
        },
        {
          id: "result-2",
          file: "src/transaction.rs",
          line: 184,
          column: 12,
          preview: "RecoveryOrchestrator::new()",
          lineText: "  let orchestrator = RecoveryOrchestrator::new();",
        },
        {
          id: "result-3",
          file: "tests/recovery_test.rs",
          line: 22,
          column: 8,
          preview: "let orchestrator = RecoveryOrchestrator::default();",
          lineText: "  let orchestrator = RecoveryOrchestrator::default();",
        },
      ];

      const filtered = mockResults.filter((r) =>
        caseSensitive
          ? r.lineText.includes(searchTerm)
          : r.lineText.toLowerCase().includes(searchTerm.toLowerCase())
      );

      setResults(filtered);
      setIsSearching(false);
    },
    [caseSensitive]
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
                  onResultClick(result.file, result.line, result.column)
                }
              >
                <div className="result-location">
                  <span className="file-name">{result.file}</span>
                  <span className="line-number">:{result.line}</span>
                </div>
                <div className="result-preview">
                  <code>{result.lineText}</code>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
