- You MUST verify it with linter, formatter, and type checker.

  Use the following commands:
    - `<build command>` to check for type errors
    - `<lint command>` to run the linter
    - `<lint:fix command>` to fix linting issues automatically
    - `<format:check command>` to check formatting
    - `<format:fix command>` to fix formatting issues

- You MUST update the unit tests for changed code.

- You MUST run tests with the `<test command>` to verify that your changes do
  not break existing functionality.

- When making changes to the project structure, ensure the Project Structure
  section in `AGENTS.md` is updated and remains valid.

- If the prompt essentially asks you to refactor or improve existing code, check
  if you can phrase it as a code guideline. If it's possible, add it to
  the relevant Code Guidelines section in `AGENTS.md`.

- After completing the task you MUST verify that the code you've written
  follows the Code Guidelines in this file.

- Even when your task is to write or update a document (e.g., a
  plan, PRD, or any Markdown file) rather than code, you MUST
  still run `make lint` and `make lint-fix` to verify and fix
  Markdown formatting.
