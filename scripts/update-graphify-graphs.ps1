param(
  [string]$Workspace = "C:\src",
  [string[]]$Repo = @(),
  [switch]$AllRepos,
  [switch]$Recursive,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

# Helper to find git repos
function Discover-GitRepos([string]$path, [bool]$recurse) {
  $repos = New-Object System.Collections.Generic.List[string]
  $queue = New-Object System.Collections.Generic.Queue[string]
  $queue.Enqueue($path)

  while ($queue.Count -gt 0) {
    $dir = $queue.Dequeue()
    try {
      $entries = [System.IO.Directory]::GetDirectories($dir)
      foreach ($entry in $entries) {
        $name = [System.IO.Path]::GetFileName($entry)
        if ($name.StartsWith(".") -or $name -eq "node_modules" -or $name -eq "dist" -or $name -eq "bin") {
          continue
        }

        # Check if it has a .git folder or file
        $gitPath = [System.IO.Path]::Combine($entry, ".git")
        if ([System.IO.Directory]::Exists($gitPath) -or [System.IO.File]::Exists($gitPath)) {
          $repos.Add($entry)
          continue
        }

        if ($recurse) {
          $queue.Enqueue($entry)
        }
      }
    } catch {
      # ignore access/permission errors
    }
  }
  return $repos
}

# Resolve target repositories
$targetRepos = @()
if ($Repo.Count -gt 0) {
  foreach ($r in $Repo) {
    $abs = [System.IO.Path]::GetFullPath($r)
    # verify it's a git repo
    $gitPath = [System.IO.Path]::Combine($abs, ".git")
    if (-not ([System.IO.Directory]::Exists($gitPath) -or [System.IO.File]::Exists($gitPath))) {
      Write-Error "Not a Git repository: $abs"
    }
    $targetRepos += $abs
  }
} else {
  $absWorkspace = [System.IO.Path]::GetFullPath($Workspace)
  $gitPath = [System.IO.Path]::Combine($absWorkspace, ".git")
  if (-not $AllRepos -and ([System.IO.Directory]::Exists($gitPath) -or [System.IO.File]::Exists($gitPath))) {
    $targetRepos += $absWorkspace
  } else {
    $discovered = Discover-GitRepos -path $absWorkspace -recurse $Recursive
    $targetRepos += $discovered
  }
}

if ($targetRepos.Count -eq 0) {
  Write-Warning "No Git repositories found."
  exit 0
}

# Run graphify on each repo
$success = $true
foreach ($repoPath in $targetRepos) {
  Write-Host "Indexing repository: $repoPath"
  
  # Remove graphify-out directory if not incremental (Force)
  if ($Force) {
    $outPath = [System.IO.Path]::Combine($repoPath, "graphify-out")
    if (Test-Path $outPath) {
      Remove-Item -Path $outPath -Recurse -Force
    }
  }

  # Run the graphify update command
  try {
    # If the user has graphify CLI installed globally, run it
    & graphify update $repoPath
  } catch {
    # Fallback to npx @sentropic/graphify if global tool isn't found
    Write-Host "graphify command not found globally, attempting to run via npx..."
    try {
      npx -y @sentropic/graphify update $repoPath
    } catch {
      Write-Host "Graphify CLI failed or was not found. Proceeding with folder scanning only."
    }
  }

  # Run post-processing to append document nodes and directory tree structure
  try {
    $postProcessScript = [System.IO.Path]::Combine($scriptDir, "post-process-graph.mjs")
    Write-Host "Running post-process to build file/folder tree: node $postProcessScript $repoPath"
    node $postProcessScript $repoPath
  } catch {
    Write-Error "Failed to run post-processing on graph for $repoPath"
    $success = $false
  }
}

if (-not $success) {
  exit 1
}
