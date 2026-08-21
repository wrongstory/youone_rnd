# Worker Composition Boundary

Only the worker composition root may assemble worker-only adapters. Job handlers call Application use cases and must not update Feature tables directly.
