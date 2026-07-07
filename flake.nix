{
  description = "TanStack Start app — bun + node dev environment";

  # Tarball form (not the `github:` short syntax) to avoid unauthenticated
  # GitHub API calls, which are rate-limited (HTTP 403) through the local proxy.
  # flake.lock pins the exact revision after the first successful `nix develop`.
  inputs.nixpkgs.url = "https://github.com/NixOS/nixpkgs/archive/nixpkgs-unstable.tar.gz";

  outputs = { self, nixpkgs }:
    let
      # Dev shell for this machine. (builtins.currentSystem is unavailable under
      # Nix's pure/flake evaluation, so the system is pinned explicitly.)
      # Change this if you develop on another arch, e.g. "aarch64-linux".
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        packages = with pkgs; [
          bun # package manager + JS runtime for this project
          nodejs_22 # runtime for vite/prisma/eslint/wrangler tooling
          git
        ];

        shellHook = ''
          echo ""
          echo "TanStack Start dev shell"
          echo "  bun:  $(bun --version 2>/dev/null || echo 'missing')"
          echo "  node: $(node --version 2>/dev/null || echo 'missing')"
          echo "  Run: bun install   then   bun run dev"
          echo ""
        '';
      };
    };
}
