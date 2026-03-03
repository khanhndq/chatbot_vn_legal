# System Architecture: A Retrieval-Augmented Generation Framework for Vietnamese Legal Consultation

## 1. Introduction

The provided figure illustrates the end-to-end system architecture of a Retrieval-Augmented Generation (RAG) chatbot designed to assist users with Vietnamese legal and insurance inquiries. The system addresses a fundamental limitation of large language models (LLMs): while models such as GPT-4o-mini exhibit strong natural language understanding and generation capabilities, they lack access to domain-specific, up-to-date legal corpora and are prone to hallucination when asked to cite specific legal provisions. By grounding LLM responses in retrieved legal documents, the architecture ensures that generated answers are both factually accurate and traceable to authoritative sources.

A distinguishing feature of this architecture is its hybrid retrieval strategy, which combines Retrieval-Augmented Generation (RAG) with Case-Based Reasoning (CBR). The RAG component retrieves relevant statutory provisions and regulatory text, while the CBR component surfaces analogous court precedents whose factual circumstances and judicial reasoning may inform the user's situation. This dual-retrieval approach reflects the structure of Vietnamese legal practice, in which statutory interpretation is routinely complemented by reference to precedent decisions published by the Supreme People's Court (*Tòa Án Nhân Dân Tối Cao*).

The architecture comprises four principal stages, each corresponding to a distinct module within the codebase: (1) a pre-retrieval process encompassing data acquisition and vector indexing; (2) a retrieval stage that performs semantic search over the indexed corpus; (3) a post-retrieval process that filters and fuses results from both RAG and CBR pipelines; and (4) a generation stage that produces structured, citation-grounded responses. These stages are supported by a real-time client application that delivers the conversational interface to end users. The following sections describe each stage in detail.

## 2. Pre-Retrieval Process

The pre-retrieval process operates offline and is responsible for transforming raw legal documents into a semantically searchable vector index. This process is subdivided into two sequential phases: data acquisition via web crawling and optical character recognition (OCR), followed by document chunking and embedding generation.

### 2.1 Data Acquisition and OCR

The data acquisition pipeline, implemented in the `crawler/` module, targets the case law portal of the Supreme People's Court of Vietnam (`anle.toaan.gov.vn`). The crawler employs a modular architecture built around an abstract `BaseCrawler` class, with site-specific implementations inheriting common functionality for browser management, retry logic, and download orchestration. The `AnleCrawler` implementation uses Puppeteer in headless mode to navigate the court's Oracle ADF-rendered web interface, which requires JavaScript execution for content rendering. The crawler traverses paginated document listings, extracts download links and metadata (case numbers, court names, case types), and retrieves the associated PDF files.

At the time of writing, the crawler has acquired 1,960 scanned PDF documents from the court portal. These documents are predominantly digitized court decisions that contain Vietnamese text rendered as images within the PDF, necessitating optical character recognition for text extraction. The OCR pipeline is implemented as a shell script (`scripts/pdf2txt.sh`) that invokes OCRmyPDF with the Tesseract engine configured for dual-language recognition (`vie+eng`). The `--force-ocr` flag ensures that all pages are processed through the OCR engine regardless of any embedded text layers, and the `--sidecar` option extracts the recognized text into separate plain-text files. This pipeline has produced 1,955 text files from the 1,960 input PDFs, with the small discrepancy attributable to corrupted or empty source documents.

### 2.2 Document Chunking and Vector Indexing

The indexing pipeline, implemented in the `chatbot-indexing/` module, ingests text from three distinct data sources and transforms them into vector representations suitable for semantic retrieval. The three source types and their respective chunking strategies are as follows.

**Statutory texts (Laws).** Legal texts are parsed from plain-text files located in `dataset/raw/laws/`. The parser employs regex-based detection of Vietnamese legal document structure, identifying chapter headings (*Chương*), section headings (*Mục*), and article boundaries (*Điều*). Each article constitutes a single chunk, with hierarchical context (parent chapter and section titles) prepended to preserve structural information. Articles containing fewer than 100 estimated tokens are merged with subsequent articles to avoid the creation of excessively small chunks that would lack sufficient semantic content for meaningful retrieval.

**Court precedents.** The OCR-extracted precedent texts are parsed with section-level granularity, recognizing structural markers such as *Nhận thấy* (facts), *Xét thấy* (reasoning), *Quyết định* (decision), and *Tuyên xử* (verdict). Sections exceeding 1,000 estimated tokens are recursively split at sentence boundaries. Adjacent chunks within the same section share a 100-token overlap to preserve contextual continuity across chunk boundaries. Metadata extraction captures the case number, court name, and case type (civil, criminal, administrative, commercial, or labor) from document headers.

**Frequently asked questions (FAQs).** FAQ data is parsed from CSV files containing question-answer pairs. Each row produces a single chunk with concatenated text in the format "Câu hỏi: {question}\n\nTrả lời: {answer}," preserving the conversational structure of the source material.

All chunks are subject to a maximum size constraint of 14,000 characters, which corresponds to approximately 7,000 tokens under the cl100k_base tokenizer used by the OpenAI embedding model. Chunks exceeding this limit are split at sentence boundaries, with each sub-chunk inheriting the metadata of its parent.

Embedding vectors are generated using the OpenAI `text-embedding-3-small` model, which produces 1,536-dimensional dense vectors. Embeddings are computed in batches of 50 with exponential backoff retry logic (up to 5 attempts) to handle rate limiting. The resulting vectors, along with their full chunk text and source-specific metadata, are upserted into a Pinecone vector database under the index name `chatbot-vn-legal`. Chunk identifiers are sanitized to ASCII by stripping Vietnamese diacritics via Unicode NFD normalization, as required by Pinecone's ID constraints.

The current index contains **15,220 vectors** in total, comprising 2,597 law chunks, 12,306 precedent chunks, and 317 FAQ chunks. The indexing pipeline completed in approximately 1,403 seconds.

## 3. Retrieval Stage

The retrieval stage operates at runtime and is triggered by the function calling system within the backend service (`chatbot_be/`). When a user submits a legal query, the `search_legal` tool is invoked to perform semantic search against the Pinecone index.

The retrieval strategy implements a **parallel dual-search architecture** that separates RAG and CBR retrieval paths:

1. **RAG retrieval.** The user's query is embedded using the same `text-embedding-3-small` model employed during indexing. The resulting query vector is submitted to Pinecone with a metadata filter restricting results to chunks where `source_type` is either `"law"` or `"faq"`. This retrieval path returns the top-*k* most semantically similar statutory provisions and FAQ entries (default *k* = 5, maximum *k* = 10).

2. **CBR retrieval.** The same query embedding is simultaneously submitted to Pinecone with a metadata filter restricting results to chunks where `source_type` equals `"precedent"`. The top-*k* value for precedent retrieval is capped at 3, reflecting the substantially greater length of precedent chunks and the need to remain within the LLM's context window.

Both retrieval paths execute in parallel to minimize latency. Each returned result includes a relevance score (cosine similarity, normalized to the range [0, 1]), the full chunk text, the source type, the document name, and source-specific metadata fields (e.g., article number and chapter for laws; case number, court, and case type for precedents; question text for FAQs).

## 4. Post-Retrieval Process

The post-retrieval process applies score-based filtering and structures the combined retrieval results into a unified output format consumed by the generation stage. Results from both the RAG and CBR retrieval paths are formatted into a structured JSON response containing two principal sections:

- **`legal_provisions`**: An array of retrieved statutory provisions and FAQ entries from the RAG path, each annotated with its relevance score, source document, and structural metadata (article, chapter, document title).
- **`case_precedents`**: An array of retrieved court precedent excerpts from the CBR path, each annotated with its relevance score, case number, court name, case type, and section label (facts, reasoning, decision).

When no relevant results are found in either retrieval path, the system returns a negative response with a suggestion to rephrase the query using alternative legal terminology. The `strategy` field in the response is set to `"CBR+RAG"` to indicate the hybrid retrieval methodology.

## 5. Generation Stage

The generation stage is orchestrated by the `ChatbotService` within the `chatbot_be/` module and employs the OpenAI GPT-4o-mini model with function calling capabilities. The generation process follows a multi-step pipeline that integrates retrieval, context management, caching, and structured response formatting.

### 5.1 Function Calling Architecture

The system employs OpenAI's function calling mechanism to bridge the gap between the user's natural language query and the structured retrieval system. The backend defines a registry of tools, with `search_legal` as the primary tool for legal knowledge retrieval. The tool schema specifies three parameters: a required `query` string derived from the current user question, an optional `source_type` filter (`"law"`, `"precedent"`, or `"faq"`), and an optional `top_k` parameter controlling the number of results.

The function calling loop is configured with `toolChoice: 'required'` on the first iteration, ensuring that the model invokes the retrieval tool at least once before generating a response. Subsequent iterations revert to `toolChoice: 'auto'`, allowing the model to decide whether additional tool calls are necessary. The maximum number of tool call iterations is set to 3 per user message.

### 5.2 Conversation Context Management

The system maintains per-session conversation context in Redis with a sliding window of the **6 most recent messages** (alternating user and assistant turns). Session data is persisted with a time-to-live (TTL) of **86,400 seconds (24 hours)**, after which the session context expires and is garbage-collected. This bounded context window ensures that the model receives sufficient conversational history for coherent multi-turn dialogue while preventing excessive token consumption.

### 5.3 Response Caching

To reduce latency and API costs for repeated queries, the system implements a response caching layer in Redis. Each unique query is hashed using a deterministic 32-bit hash function (producing a base-36 string key), and the corresponding AI-generated response is cached with a TTL of **3,600 seconds (1 hour)**. Incoming messages are checked against the cache before invoking the OpenAI API; cache hits bypass the entire retrieval and generation pipeline.

### 5.4 Structured Response Format

The system prompt instructs the model to produce responses in a structured format comprising four sections: (1) a brief summary of 2–3 sentences directly answering the user's question; (2) a legal basis section citing specific articles with full citations in the format "Theo Điều X, Luật Y" (*Per Article X, Law Y*); (3) a case precedents section presenting analogous court decisions with their factual circumstances, judicial reasoning, and verdicts; and (4) practical considerations and notes. The model is instructed to prefer Markdown tables for structured data such as tax rate schedules and insurance type comparisons, and to respond in Vietnamese unless the user communicates in English.

### 5.5 Streaming

The backend supports token-by-token streaming of generated responses via Socket.io events. When streaming is enabled, the `streamChatWithTools` method first executes all tool calls to completion, then streams the final generation output. Stream events follow the sequence `stream_start` → `stream_chunk` (repeating) → `stream_end`, allowing the client to render partial responses progressively.

## 6. User Query Flow

The client-facing layer comprises a React 19 single-page application (`chatbot_web_app/`) communicating with the Express/Socket.io backend (`chatbot_be/`) through a dual-transport architecture.

### 6.1 Client Application

The frontend is built with React 19, TypeScript, and Tailwind CSS, organized around a central `useChat` hook that encapsulates all state management for messages, connection status, and session lifecycle. The hook integrates React Query (TanStack Query v5) for server-state synchronization, including chat history fetching with a 5-minute stale time and automatic retry with exponential backoff.

The `WebSocketService` class implements a Socket.io client with automatic reconnection (up to 5 attempts with exponential backoff starting at 1 second). Transport negotiation begins with WebSocket and falls back to HTTP long-polling if the WebSocket connection fails. When the WebSocket transport is unavailable, the `useChat` hook transparently falls back to REST API calls via an Axios-based `ApiService`, ensuring uninterrupted service regardless of network conditions.

Session identifiers are generated as UUIDs on the client side and persisted in `localStorage` to maintain session continuity across page reloads. The interface supports class-based dark mode toggling, also persisted in `localStorage`.

### 6.2 Backend Request Processing

Upon receiving a `chat_message` event via WebSocket (or a `POST /api/messages/send` request via REST), the backend `ChatbotService` executes the following processing pipeline:

1. **Cache lookup.** The incoming message is hashed and checked against the Redis response cache (TTL: 1 hour).
2. **Context assembly.** The session's conversation history (up to 6 messages) is retrieved from Redis and prepended to the current message as context for the LLM.
3. **Tool-augmented generation.** The assembled context and system prompt are submitted to GPT-4o-mini with the `search_legal` tool definition. The model is required to invoke the tool at least once, triggering the dual RAG+CBR retrieval described in Sections 3 and 4.
4. **Response delivery.** The generated response is returned to the client via the appropriate transport (WebSocket event or HTTP response), cached in Redis, and persisted to the PostgreSQL database alongside the user's original message.
5. **Context update.** The new user-assistant message pair is appended to the session's conversation history in Redis, with the window truncated to maintain the 6-message limit.

### 6.3 Data Persistence

The system employs PostgreSQL for durable storage of chat sessions and messages. The schema consists of two tables: `chat_sessions` (tracking session creation and last activity timestamps) and `messages` (storing user messages and bot responses with foreign key references to their parent session, cascading on deletion). The database connection pool is configured with a maximum of 20 concurrent connections.

## 7. Offline vs. Runtime Distinction

The architecture exhibits a clear separation between offline (pre-retrieval) and runtime (retrieval through generation) processes:

**Offline processes** encompass web crawling, OCR, document parsing, chunking, embedding generation, and vector index construction. These processes are executed infrequently — typically when the legal corpus is updated with new legislation or court decisions — and do not affect system availability during execution. The indexing pipeline supports a dry-run mode for validation without API consumption.

**Runtime processes** encompass query embedding, vector retrieval, post-retrieval fusion, LLM generation, caching, and response delivery. These processes execute on every user query and are optimized for low latency through parallel retrieval, response caching, connection pooling, and streaming delivery. The Redis caching layer and bounded conversation context ensure that runtime costs scale predictably with user traffic rather than corpus size.

This architectural separation enables the system to serve real-time queries against a large legal corpus (15,220 indexed vectors spanning statutory texts, court precedents, and FAQs) while maintaining response times suitable for interactive conversational use.
