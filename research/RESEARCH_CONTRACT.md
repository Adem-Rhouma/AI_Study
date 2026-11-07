# AI Mastery — Curriculum Research Contract

Every research agent writes ONE JSON file to `research/`. Read this whole file before working.

## Goal
Build a comprehensive, defensible taxonomy of the AI discipline for an education platform.
Depth is Domain > Subdomain > Topic > (Concepts inside topic). We are producing the topic
level plus enough per-topic detail that lesson authors can work from it.

## JSON output schema (strict)

```json
{
  "area": "short-kebab-slug-for-your-file",
  "owner_agent": "A1|A2|A3|A4|A5|A6",
  "domains": [
    {
      "slug": "mathematical-foundations",
      "name": "Mathematical Foundations",
      "summary": "2-3 sentence description of the domain and why it matters for AI.",
      "subdomains": [
        {
          "slug": "linear-algebra",
          "name": "Linear Algebra",
          "summary": "1-2 sentences.",
          "topics": [
            {
              "slug": "matrix-decompositions",
              "name": "Matrix Decompositions",
              "difficulty": "intermediate",
              "tags": ["numerical-linear-algebra"],
              "definition": "Precise 1-2 sentence definition.",
              "explanation": "4-8 sentences. What it is, the core idea, why AI needs it. No fluff.",
              "learning_objectives": ["State ...", "Derive ...", "Implement ..."],
              "prerequisites_strict": ["vector-spaces", "matrix-multiplication"],
              "prerequisites_recommended": ["numerical-stability"],
              "related_concepts": ["sva-low-rank-approximation"],
              "advanced_extensions": ["randomized-svd"],
              "key_results_or_algorithms": ["LU", "QR", "Cholesky", "SVD", "Eigendecomposition"],
              "math_foundations": ["Notation the reader must already hold, one line each"],
              "applications": ["PCA / low-rank approx", "Attention as a matrix op", "Krylov solvers"],
              "common_misconceptions": ["Eigendecomposition applies to any square matrix (only diagonalizable ones)"],
              "further_reading": [
                { "title": "Matrix Computations", "authors": "Golub & Van Loan", "year": 1996, "type": "book", "url": null }
              ]
            }
          ]
        }
      ]
    }
  ],
  "notes_on_gaps": "Anything you deliberately excluded and why, plus what you could not verify."
}
```

## Rules — non-negotiable

1. **Never invent** titles, authors, years, arXiv IDs, or URLs. If unsure of a citation, set
   `url: null` and only give title/authors you are confident about. A missing reference beats a
   fabricated one.
2. `further_reading[].type` ∈ `book | paper | survey | lecture-notes | course | docs | blog`.
3. Difficulty ∈ `introductory | beginner | intermediate | advanced | expert`.
4. Prerequisite slugs must reference topic slugs. Prefer referencing slugs inside your own area;
   when a prerequisite lives outside your area, use the slug from the shared cross-area table below
   and do NOT redefine that topic.
5. Slugs: lowercase-kebab, unique across the whole project. No slug collisions with other areas.
6. Aim for **substance over count**. 25-45 rich topics per agent is right. Do not pad with stubs.
   Every topic you emit must have real `definition` + `explanation` + `learning_objectives`.
7. Prefer primary/authoritative sources: university curricula (CMU 10-725, Stanford CS229/CS231n/
   CS224n/CS236, MIT 6.036/18.657, Berkeley CS285/CS294-112, ETH, TUB), standard texts (Bishop,
   Hastie Tibshirani Friedman, Goodfellow DL, Boyd Vandenberghe, Murphy PML/DAPM, Sutton & Barto,
   Boyd & Vandenberghe, Nocedal & Wright, Wasserman, Pearl, Barndorff-Nielsen, MacKay, Rasmussen
   Williams, Prince, Petersen Pedersen, Nielsen, Bertsekas, Puterman, Russell & Norvig, Knuth),
   conference proceedings (NeurIPS/ICML/ICLR/AAAI/CVPR/ACL/JMLR), and official docs.
8. Historical and foundational work counts even when unfashionable. Do not confuse popularity with
   importance.
9. Mark speculative/open problems explicitly in `common_misconceptions` or `notes_on_gaps`.

## Shared cross-area slugs (reference these, do not redefine)

Math: `linear-algebra-foundations`, `matrix-analytical-functions`, `multivariable-calculus`,
`optimization-convex`, `probability-foundations`, `statistical-inference`, `information-theory`,
`numerical-linear-algebra`, `measure-theoretic-probability`, `graph-theory-foundations`,
`discrete-mathematics`, `mathematical-logic`, `differential-equations`, `dynamical-systems`,
`game-theory-foundations`, `control-theory-foundations`, `computational-complexity`,
`statistical-learning-theory`, `approximation-theory`, `topology-for-ml`, `algebraic-geometry-ml`,
`random-matrix-theory`, `fourier-analysis`, `functional-analysis`, `stochastic-calculus`

ML core: `supervised-learning-foundations`, `unsupervised-learning-foundations`,
`model-selection-validation`, `generalization-theory`, `feature-engineering`,
`probabilistic-graphical-models`, `markov-decision-processes`, `bellman-equations`,
`policy-gradient-methods`, `transformer-architecture`, `attention-mechanisms`,
`backpropagation`, `convolutional-networks`, `recurrent-networks`, `diffusion-models`,
`variational-autoencoders`, `generative-adversarial-networks`, `normalizing-flows`,
`language-model-pretraining`, `tokenization`, `reinforcement-learning-from-human-feedback`,
`causal-inference-foundations`, `structural-causal-models`, `graph-neural-networks`,
`monte-carlo-methods`, `markov-chain-monte-carlo`, `variational-inference`,
`deep-rl-foundations`, `offline-reinforcement-learning`, `imitation-learning`,
`sequence-modeling`, `reward-modeling`, `self-supervised-learning`

## Deliverable

- The JSON file at the path given in your prompt. Valid JSON, no comments, no trailing commas.
- Then reply with: file path, topic count, and at most 120 words on what you found surprising or
  under-covered. Do not paste the JSON into your reply.
