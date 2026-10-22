# Repository Agent Guidelines & Mandatory Instructions

## MANDATORY COMMAND: AUTOMATIC GIT COMMIT & PUSH

1. **Automatic GitHub Push**:
   - Whenever ANY changes, fixes, refactorings, or updates are made to the codebase, they **MUST** be automatically committed and pushed to GitHub (`origin/main`) before completing the task.
   - **Do not wait for the user to ask or remind**: The user has given a strict standing order that all changes must be pushed to GitHub automatically.

2. **Quality Gate Before Pushing**:
   - Verify that automated tests (`npm test`) pass.
   - Ensure a clean, descriptive commit message detailing the changes.
   - Run `git push origin main` (or active tracking branch).
