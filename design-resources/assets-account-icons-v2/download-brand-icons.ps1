$ErrorActionPreference='Stop'
$dest=Join-Path (Get-Location) 'design-resources/assets-account-icons-v2'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$apps=ConvertFrom-Json @'
{"alipay":333206289,"antfortune":1025628019,"wechat":414478124,"qq":444934666,"douyin":1142110895,"pdd":1044283059,"ecny":1571652872,"jd":895682747,"unionpay":600273928,"meituan":423084029,"tencentwealth":1187801604,"paypal":283646709}
'@
$rows=@()
foreach($kv in $apps.psobject.Properties){
 $country=if($kv.Name -eq 'paypal'){'us'}else{'cn'}
 $r=Invoke-RestMethod -Uri ("https://itunes.apple.com/lookup?id="+$kv.Value+"&country="+$country)
 $a=$r.results[0]
 if(-not $a.artworkUrl512){throw "Missing icon"}
 $url=$a.artworkUrl512 -replace '512x512bb.jpg','1024x1024bb.png'
 $path=Join-Path $dest ($kv.Name+'.png')
 Invoke-WebRequest -Uri $url -OutFile $path
 $rows+=@{key=$kv.Name;id=$kv.Value;name=$a.trackName;page=$a.trackViewUrl;source=$url;path=($kv.Name+'.png');retrieved='2026-11-17'}
}
$rows | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $dest 'brand-sources.json')
$rows | Select-Object key,name,path | ConvertTo-Json
