---
kind: Workflow
name: refactor-to-solid
agents:
  preferred: cursor
  fallback: claude
tools:
  - name: read_file
    description: "Reads the target module file"
    parameters:
      path:
        type: string
        description: "Relative path to the file"
  - name: apply_patch
    description: "Applies a refactoring patch to a file"
    parameters:
      path:
        type: string
      patch:
        type: string
        description: "Unified diff patch content"
  - name: run_tests
    description: "Runs the test suite to verify the refactoring"
    parameters:
      command:
        type: string
        default: "npm test"
---

# Refactor to SOLID

Refactors a module to comply with SOLID design principles: Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, and Dependency Inversion.

## Steps

1. Read the target file and identify violations of SOLID principles
2. Propose a refactored structure with clear class/function separation
3. Apply the patch incrementally
4. Run tests to confirm the refactoring is non-breaking

## Agent Routing

- **Preferred:** cursor
- **Fallback:** claude
