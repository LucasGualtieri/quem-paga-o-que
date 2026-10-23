#!/bin/sh
# PostToolUse (Edit|Write): roda typecheck e testes quando um arquivo de código muda.
# Falhou? Devolve o fim da saída para o Claude (exit 2) corrigir antes de seguir.
file=$(jq -r '.tool_input.file_path // empty')
case "$file" in
  *.ts|*.tsx|*.js|*.mjs|*.cjs|*.json) ;;
  *) exit 0 ;;
esac

cd "$CLAUDE_PROJECT_DIR" || exit 0
out=$( (npm run -s typecheck && npm test -s) 2>&1 )
status=$?
if [ $status -ne 0 ]; then
  printf 'typecheck/testes falharam depois de editar %s:\n%s\n' "$file" "$(printf '%s\n' "$out" | tail -60)" >&2
  exit 2
fi
exit 0
