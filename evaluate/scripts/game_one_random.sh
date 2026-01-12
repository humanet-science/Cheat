#!/bin/bash
for i in {0..10}; do
  for j in {0..10}; do
    p_lie=$(echo "scale=2; $i/10" | bc)
    p_call=$(echo "scale=2; $j/10" | bc)
    sbatch \
      -p winston \
      -N 1 \
      --ntasks=1 \
      --time=04:00:00 \
      --output=logs/slurm-%A.out \
      --job-name="pl_${p_lie}_pc_${p_call}" \
      --wrap="python -m scripts.game_one_random --p_lie=$p_lie --p_call=$p_call"
  done
done