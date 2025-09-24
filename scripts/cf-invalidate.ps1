# scripts/cf-invalidate.ps1
[CmdletBinding()]
param(
  [string]   $AwsProfile = "default",
  [string]   $StackName  = "LalaWebStack",
  [string]   $Region     = "us-east-1",
  [string[]] $Paths      = @("/index.html","/robots.txt","/sitemap.xml"),
  [switch]   $Wait
)

function ThrowIfEmpty($v,$msg) { if (-not $v -or $v -eq "None") { throw $msg } }

# --- read outputs ---
$stackOutputsJson = aws cloudformation describe-stacks `
  --stack-name $StackName --profile $AwsProfile --region $Region `
  --query "Stacks[0].Outputs" --output json
$outs = $stackOutputsJson | ConvertFrom-Json

$cfUrl  = ($outs | Where-Object { $_.OutputKey -eq "CfDomainFallback" }).OutputValue
ThrowIfEmpty $cfUrl "Could not read 'CfDomainFallback' from stack outputs."
$cfHost = $cfUrl -replace '^https?://',''

$distId = aws cloudfront list-distributions `
  --profile $AwsProfile --region $Region `
  --query ("DistributionList.Items[?DomainName=='{0}'].Id | [0]" -f $cfHost) `
  --output text
ThrowIfEmpty $distId "Could not resolve DistributionId from domain '$cfHost'."

if (-not $Paths -or $Paths.Count -eq 0) {
  $Paths = @("/index.html","/robots.txt","/sitemap.xml")
}

Write-Host "Invalidating $($Paths -join ', ') on $distId ($cfHost) ..."
$invId = aws cloudfront create-invalidation `
  --profile $AwsProfile --region $Region `
  --distribution-id $distId --paths $Paths `
  --query "Invalidation.Id" --output text
Write-Host "Invalidation ID: $invId"

if ($Wait) {
  do {
    Start-Sleep -Seconds 5
    $status = aws cloudfront get-invalidation `
      --profile $AwsProfile --region $Region `
      --distribution-id $distId --id $invId `
      --query "Invalidation.Status" --output text
    Write-Host "Status: $status"
  } while ($status -ne "Completed")
}
