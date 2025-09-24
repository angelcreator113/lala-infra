# scripts/s3-publish.ps1
[CmdletBinding()]
param(
  [string]   $AwsProfile = "default",
  [string]   $StackName  = "LalaWebStack",
  [string]   $Region     = "us-east-1",
  [string]   $SiteDir    = "site",
  [string[]] $Paths      = @("/index.html","/robots.txt","/sitemap.xml"),
  [switch]   $Wait
)

function ThrowIfEmpty($v,$msg){ if (-not $v -or $v -eq "None") { throw $msg } }

# --- outputs we need ---
$stackOutputsJson = aws cloudformation describe-stacks `
  --stack-name $StackName --profile $AwsProfile --region $Region `
  --query "Stacks[0].Outputs" --output json
$outs = $stackOutputsJson | ConvertFrom-Json

$bucket = ($outs | Where-Object { $_.OutputKey -eq "SiteBucketName" }).OutputValue
ThrowIfEmpty $bucket "Could not find SiteBucketName in stack '$StackName'."

Write-Host "Publishing from '$SiteDir' to s3://$bucket ..."

# Upload a file only if it exists (with optional Cache-Control)
function Upload-IfExists($local, $dest, $contentType, $cacheControl = $null) {
  if (Test-Path $local) {
    $args = @("--profile", $AwsProfile, "--region", $Region, "s3", "cp", $local, $dest, "--content-type", $contentType)
    if ($cacheControl) { $args += @("--cache-control", $cacheControl) }
    aws @args
    if ($LASTEXITCODE -ne 0) { throw "AWS CLI failed uploading $local" }
  } else {
    Write-Host "Skipping $(Split-Path $local -Leaf) (not present locally)."
  }
}

# upload the three "page" files with tight caching (5 minutes)
$shortCache = "public, max-age=300, must-revalidate"
Upload-IfExists (Join-Path $SiteDir "index.html")  ("s3://$bucket/index.html")  "text/html; charset=utf-8"        $shortCache
Upload-IfExists (Join-Path $SiteDir "robots.txt")  ("s3://$bucket/robots.txt")  "text/plain; charset=utf-8"       $shortCache
Upload-IfExists (Join-Path $SiteDir "sitemap.xml") ("s3://$bucket/sitemap.xml") "application/xml; charset=utf-8"  $shortCache

# invalidate (re-use the other script so logic stays in one place)
& "$PSScriptRoot\cf-invalidate.ps1" `
  -AwsProfile $AwsProfile -StackName $StackName -Region $Region -Paths $Paths -Wait:$Wait.IsPresent
