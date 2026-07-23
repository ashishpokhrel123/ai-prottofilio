# Knowledge base

Everything in these folders is chunked, embedded, and stored in pgvector so the
agent can answer questions from it. **Only facts present here (or in the seeded
database) will ever be stated by the assistant.**

Folders (`resume/`, `projects/`, `experience/`, `skills/`, `education/`,
`certificates/`, `blogs/`) accept `.md`, `.txt`, `.json`, `.csv`. Add files, then
run the seed + `POST /embeddings/index` (or upload via the admin panel).

Also drop your resume PDF at `resume/ashish-pokhrel-resume.pdf` to enable the
`GET /resume` download button.
