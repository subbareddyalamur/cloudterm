#!/bin/bash

# Example script to run CloudTerm with custom tag configuration
# Set your desired tag names for organizing instances

# TAG1 will be the root level (e.g., Customer, Project, Team)
export TAG1="Customer"

# TAG2 will be the branch level (e.g., Environment, Stage, Region)
export TAG2="Environment"

echo "Starting CloudTerm with TAG1=$TAG1 and TAG2=$TAG2"
echo "Instances will be organized by these tags in the tree structure"

# Run the application
python app.py
