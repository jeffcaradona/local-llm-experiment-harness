# Historical greeting-harness v2.5 commands recovered from ~/.bash_history.
# These are provenance/scratch commands, not the supported project interface.

# Default run used during v2.5 development.
$env:BASE_URL = 'https://ollama.redshift.irrational.cc/v1'
node greeting-harness-v2.5.mjs 10

# Sweep used for the v2.5 target/temperature investigation.
# Known observation:
#   temp=0, target=10 failed/truncated
#   targets 9 and 11 passed
#   target=10 recovered at temp=.7
$env:BASE_URL = 'https://ollama.redshift.irrational.cc/v1'
$env:TARGETS = '2,4,6,7,8,9,10,11,12,13'
$env:TEMPERATURES = '0,.7'
$env:MAX_TOKENS_LIST = '3200'
$env:PROMPT_TEMPLATES_FILE = 'NUL'
node greeting-harness-v2.5.mjs 10