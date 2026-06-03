param(
  [int]$Port = 4180,
  [string]$RootPath = $PSScriptRoot,
  [string]$DataPath = (Join-Path $PSScriptRoot "data\local-portal-state.json")
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path -LiteralPath $RootPath).Path
$dataDirectory = Split-Path -Parent $DataPath
if (-not (Test-Path -LiteralPath $dataDirectory)) {
  New-Item -ItemType Directory -Path $dataDirectory | Out-Null
}

$adminCode = if ($env:ADMIN_ACCESS_CODE) { $env:ADMIN_ACCESS_CODE } else { "PHILOTIMO-ADMIN" }
$sessions = @{}
$server = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)

function New-EmptyState {
  [pscustomobject][ordered]@{
    teachers = @()
    students = @()
    allocations = @()
    jobseekers = @()
    employerRequests = @()
    jobPlacements = @()
    contacts = @()
    subscriptions = @()
    notifications = @()
  }
}

function Normalize-State {
  param($State)

  $normalized = New-EmptyState
  if (-not $State) { return $normalized }

  foreach ($key in @("teachers", "students", "allocations", "jobseekers", "employerRequests", "jobPlacements", "contacts", "subscriptions", "notifications")) {
    if ($State.PSObject.Properties.Name -contains $key -and $State.$key) {
      $normalized.$key = @($State.$key)
    }
  }
  return $normalized
}

function Read-State {
  if (-not (Test-Path -LiteralPath $DataPath)) {
    return Write-State -State (New-EmptyState)
  }

  $raw = Get-Content -LiteralPath $DataPath -Raw
  if ([string]::IsNullOrWhiteSpace($raw)) { return New-EmptyState }
  return Normalize-State -State ($raw | ConvertFrom-Json)
}

function Write-State {
  param($State)

  $normalized = Normalize-State -State $State
  $normalized | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $DataPath -Encoding UTF8
  return $normalized
}

function Clean {
  param($Value)
  if ($null -eq $Value) { return "" }
  return [string]$Value.ToString().Trim()
}

function Clean-Array {
  param($Value)
  if ($null -eq $Value) { return @() }
  if ($Value -is [array]) { return @($Value | ForEach-Object { Clean $_ } | Where-Object { $_ }) }
  return @((Clean $Value))
}

function New-Record {
  param([hashtable]$Fields)

  $record = [ordered]@{
    id = [guid]::NewGuid().ToString()
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
  }
  foreach ($key in $Fields.Keys) { $record[$key] = $Fields[$key] }
  return [pscustomobject]$record
}

function Send-EmailNotification {
  param($Notification)

  if (-not (Clean $Notification.to)) {
    return [pscustomobject]@{ status = "skipped"; error = "No email address is attached to this record."; sentAt = "" }
  }

  if (-not (Clean $env:SMTP_HOST)) {
    return [pscustomobject]@{ status = "not-configured"; error = "SMTP_HOST is not configured, so the email was saved but not sent."; sentAt = "" }
  }

  $port = if (Clean $env:SMTP_PORT) { [int](Clean $env:SMTP_PORT) } else { 587 }
  $from = if (Clean $env:SMTP_FROM) { Clean $env:SMTP_FROM } else { "no-reply@philotimo.local" }
  $fromName = if (Clean $env:SMTP_FROM_NAME) { Clean $env:SMTP_FROM_NAME } else { "Philotimo Educational Consultancy Services" }
  $enableSsl = if (Clean $env:SMTP_ENABLE_SSL) { [Convert]::ToBoolean((Clean $env:SMTP_ENABLE_SSL)) } else { $true }

  $message = $null
  $client = $null
  try {
    $message = [System.Net.Mail.MailMessage]::new()
    $message.From = [System.Net.Mail.MailAddress]::new($from, $fromName)
    $message.To.Add((Clean $Notification.to))
    $message.Subject = Clean $Notification.subject
    $message.Body = Clean $Notification.body
    $message.IsBodyHtml = $false

    $client = [System.Net.Mail.SmtpClient]::new((Clean $env:SMTP_HOST), $port)
    $client.EnableSsl = $enableSsl
    if (Clean $env:SMTP_USERNAME) {
      $client.Credentials = [System.Net.NetworkCredential]::new((Clean $env:SMTP_USERNAME), (Clean $env:SMTP_PASSWORD))
    }

    $client.Send($message)
    return [pscustomobject]@{ status = "sent"; error = ""; sentAt = (Get-Date).ToUniversalTime().ToString("o") }
  } catch {
    return [pscustomobject]@{ status = "failed"; error = $_.Exception.Message; sentAt = "" }
  } finally {
    if ($message) { $message.Dispose() }
    if ($client) { $client.Dispose() }
  }
}

function Add-EmailNotification {
  param(
    $State,
    [string]$To,
    [string]$Subject,
    [string]$Body,
    [string]$RelatedType,
    [string]$RelatedId
  )

  $notification = New-Record @{
    to = Clean $To
    subject = Clean $Subject
    body = Clean $Body
    relatedType = Clean $RelatedType
    relatedId = Clean $RelatedId
    provider = "smtp"
    status = "queued"
    sentAt = ""
    error = ""
  }

  $delivery = Send-EmailNotification -Notification $notification
  $notification.status = $delivery.status
  $notification.sentAt = $delivery.sentAt
  $notification.error = $delivery.error
  $State.notifications = @($notification) + @($State.notifications)
  return $notification
}

function New-SubscriptionReceiptNumber {
  param($State)

  $year = (Get-Date).ToString("yyyy")
  $count = @($State.subscriptions | Where-Object { Clean $_.receiptNumber }).Count + 1
  return "PES-REC-$year-{0:D4}" -f $count
}

function Require-Fields {
  param($Payload, [string[]]$Fields)

  $missing = @()
  foreach ($field in $Fields) {
    if (-not ($Payload.PSObject.Properties.Name -contains $field)) {
      $missing += $field
    } elseif ($Payload.$field -is [array]) {
      if (@($Payload.$field).Count -eq 0) { $missing += $field }
    } elseif (-not (Clean $Payload.$field)) {
      $missing += $field
    }
  }

  if ($missing.Count) {
    $suffix = if ($missing.Count -eq 1) { "" } else { "s" }
    throw "Missing required field${suffix}: $($missing -join ', ')"
  }
}

function Read-HttpRequest {
  param([IO.Stream]$Stream)

  $reader = [IO.StreamReader]::new($Stream, [Text.Encoding]::UTF8, $false, 8192, $true)
  $line = $reader.ReadLine()
  if ([string]::IsNullOrWhiteSpace($line)) { return $null }

  $parts = $line.Split(" ")
  $headers = @{}
  while ($true) {
    $headerLine = $reader.ReadLine()
    if ($null -eq $headerLine -or $headerLine -eq "") { break }
    $separator = $headerLine.IndexOf(":")
    if ($separator -gt 0) {
      $headers[$headerLine.Substring(0, $separator).Trim().ToLowerInvariant()] = $headerLine.Substring($separator + 1).Trim()
    }
  }

  $body = ""
  if ($headers.ContainsKey("content-length")) {
    $length = [int]$headers["content-length"]
    if ($length -gt 0) {
      $buffer = New-Object char[] $length
      $read = $reader.Read($buffer, 0, $length)
      $body = -join $buffer[0..($read - 1)]
    }
  }

  return [pscustomobject]@{
    Method = $parts[0]
    Path = ([Uri]::UnescapeDataString($parts[1].Split("?")[0]))
    Headers = $headers
    Body = $body
  }
}

function Get-BodyJson {
  param($Request)

  if ([string]::IsNullOrWhiteSpace($Request.Body)) { return [pscustomobject]@{} }
  return $Request.Body | ConvertFrom-Json
}

function Write-HttpResponse {
  param(
    [IO.Stream]$Stream,
    [int]$StatusCode,
    [string]$ContentType,
    [byte[]]$Body,
    [bool]$HeadOnly = $false
  )

  $statusText = switch ($StatusCode) {
    200 { "OK" }
    201 { "Created" }
    400 { "Bad Request" }
    401 { "Unauthorized" }
    403 { "Forbidden" }
    404 { "Not Found" }
    405 { "Method Not Allowed" }
    500 { "Internal Server Error" }
    default { "OK" }
  }
  $header = "HTTP/1.1 $StatusCode $statusText`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nAccess-Control-Allow-Origin: *`r`nAccess-Control-Allow-Headers: Content-Type, Authorization`r`nAccess-Control-Allow-Methods: GET, POST, OPTIONS`r`nConnection: close`r`n`r`n"
  $headerBytes = [Text.Encoding]::UTF8.GetBytes($header)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  if (-not $HeadOnly) { $Stream.Write($Body, 0, $Body.Length) }
}

function Send-Json {
  param([IO.Stream]$Stream, [int]$StatusCode, $Body)

  $json = $Body | ConvertTo-Json -Depth 30
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  Write-HttpResponse -Stream $Stream -StatusCode $StatusCode -ContentType "application/json; charset=utf-8" -Body $bytes
}

function Send-Text {
  param([IO.Stream]$Stream, [int]$StatusCode, [string]$Text)

  $bytes = [Text.Encoding]::UTF8.GetBytes($Text)
  Write-HttpResponse -Stream $Stream -StatusCode $StatusCode -ContentType "text/plain; charset=utf-8" -Body $bytes
}

function Get-MimeType {
  param([string]$Path)

  switch ([IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".html" { "text/html; charset=utf-8" }
    ".css" { "text/css; charset=utf-8" }
    ".js" { "text/javascript; charset=utf-8" }
    ".json" { "application/json; charset=utf-8" }
    ".svg" { "image/svg+xml" }
    ".png" { "image/png" }
    ".jpg" { "image/jpeg" }
    ".jpeg" { "image/jpeg" }
    ".webp" { "image/webp" }
    ".ico" { "image/x-icon" }
    default { "application/octet-stream" }
  }
}

function Get-BearerToken {
  param($Request)

  if ($Request.Headers.ContainsKey("authorization") -and $Request.Headers["authorization"].StartsWith("Bearer ")) {
    return $Request.Headers["authorization"].Substring(7)
  }
  return ""
}

function Test-Admin {
  param($Request)

  $token = Get-BearerToken -Request $Request
  return $token -and $sessions.ContainsKey($token) -and $sessions[$token] -gt (Get-Date)
}

function Score-Teacher {
  param($Teacher, $Student)

  $score = 0
  $requested = (Clean $Student.requestedSubject).ToLowerInvariant()
  $subjects = @((Clean $Teacher.primarySubject), (Clean $Teacher.otherSubjects)) -join ","
  $subjects = @($subjects.Split(",") | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ })
  if ((Clean $Teacher.primarySubject).ToLowerInvariant() -eq $requested) { $score += 60 }
  if ($subjects -contains $requested) { $score += 30 }
  if (@($Teacher.classLevels) -contains $Student.studentClass) { $score += 25 }
  if ($Teacher.teachingMode -eq $Student.preferredMode -or $Teacher.teachingMode -eq "Hybrid lesson") { $score += 15 }
  if ([int](Clean $Teacher.experienceYears) -ge 5) { $score += 8 }
  return $score
}

function Get-TeacherMatchCount {
  param($State, $Student)
  return @($State.teachers | Where-Object { $_.status -eq "approved" -and (Score-Teacher -Teacher $_ -Student $Student) -gt 0 }).Count
}

function Test-TextMatch {
  param($Haystack, $Needle)
  $cleanNeedle = (Clean $Needle).ToLowerInvariant()
  if (-not $cleanNeedle) { return $false }
  return (Clean $Haystack).ToLowerInvariant().Contains($cleanNeedle)
}

function Score-Jobseeker {
  param($Jobseeker, $Request)

  $score = 0
  if ($Jobseeker.jobCategory -eq $Request.categoryNeeded) { $score += 30 }
  if (Test-TextMatch $Jobseeker.preferredRole $Request.roleNeeded) { $score += 34 }
  if (Test-TextMatch $Jobseeker.coreSkills $Request.roleNeeded) { $score += 24 }
  if ($Jobseeker.employmentType -eq $Request.requestEmploymentType) { $score += 14 }
  if ([int](Clean $Jobseeker.jobExperienceYears) -ge [int](Clean $Request.experienceNeeded)) { $score += 12 }
  if ((Test-TextMatch $Jobseeker.jobLocation $Request.employerLocation) -or (Test-TextMatch $Request.employerLocation $Jobseeker.jobLocation)) { $score += 8 }
  if ($Jobseeker.availability -eq "Immediate") { $score += 5 }
  return $score
}

function Get-JobseekerMatchCount {
  param($State, $Request)
  return @($State.jobseekers | Where-Object { $_.status -eq "approved" -and (Score-Jobseeker -Jobseeker $_ -Request $Request) -gt 0 }).Count
}

function Invoke-AdminAction {
  param($State, $Payload)

  $action = Clean $Payload.action
  $id = Clean $Payload.id
  $selectedId = Clean $Payload.selectedId

  if ($action -in @("approve-teacher", "reject-teacher", "reopen-teacher")) {
    $teacher = @($State.teachers | Where-Object { $_.id -eq $id })[0]
    if (-not $teacher) { throw "Teacher application not found." }
    $teacher.status = if ($action -eq "approve-teacher") { "approved" } elseif ($action -eq "reject-teacher") { "rejected" } else { "pending" }
    $body = @"
Dear $($teacher.teacherName),

Your subject teacher application with Philotimo Educational Consultancy Services has been updated.

Status: $($teacher.status)
Main subject: $($teacher.primarySubject)
Teaching mode: $($teacher.teachingMode)
Current workplace: $($teacher.workplace)

Thank you for your interest in working with Philotimo.
"@
    $email = Add-EmailNotification -State $State -To $teacher.teacherEmail -Subject "Philotimo teacher application update" -Body $body -RelatedType "teacher" -RelatedId $teacher.id
    return [pscustomobject]@{ message = "$($teacher.teacherName) is now $($teacher.status)."; emails = @($email) }
  }

  if ($action -in @("approve-jobseeker", "reject-jobseeker", "reopen-jobseeker")) {
    $jobseeker = @($State.jobseekers | Where-Object { $_.id -eq $id })[0]
    if (-not $jobseeker) { throw "Jobseeker profile not found." }
    $jobseeker.status = if ($action -eq "approve-jobseeker") { "approved" } elseif ($action -eq "reject-jobseeker") { "rejected" } else { "pending" }
    $body = @"
Dear $($jobseeker.jobName),

Your jobseeker profile with Philotimo Educational Consultancy Services has been updated.

Status: $($jobseeker.status)
Preferred role: $($jobseeker.preferredRole)
Category: $($jobseeker.jobCategory)

Thank you for registering with the Philotimo talent portal.
"@
    $email = Add-EmailNotification -State $State -To $jobseeker.jobEmail -Subject "Philotimo jobseeker profile update" -Body $body -RelatedType "jobseeker" -RelatedId $jobseeker.id
    return [pscustomobject]@{ message = "$($jobseeker.jobName) is now $($jobseeker.status)."; emails = @($email) }
  }

  if ($action -in @("verify-subscription", "reject-subscription", "reopen-subscription")) {
    $subscription = @($State.subscriptions | Where-Object { $_.id -eq $id })[0]
    if (-not $subscription) { throw "Subscription record not found." }

    if ($action -eq "verify-subscription") {
      $subscription.status = "verified"
      $subscription.verifiedAt = (Get-Date).ToUniversalTime().ToString("o")
      if (-not (Clean $subscription.receiptNumber)) {
        $subscription.receiptNumber = New-SubscriptionReceiptNumber -State $State
      }
      $body = @"
Dear $($subscription.subscriberName),

Philotimo Educational Consultancy Services has verified your subscription payment.

Subscription: $($subscription.subscriptionType)
Amount paid: NGN $($subscription.amountPaid)
Payment reference: $($subscription.paymentReference)
Receipt number: $($subscription.receiptNumber)
Payment date: $($subscription.paymentDate)

Please keep this receipt number for your records. Thank you for choosing Philotimo.
"@
      $email = Add-EmailNotification -State $State -To $subscription.subscriberEmail -Subject "Philotimo subscription receipt" -Body $body -RelatedType "subscription" -RelatedId $subscription.id
      return [pscustomobject]@{ message = "$($subscription.subscriberName)'s payment has been verified and receipt $($subscription.receiptNumber) has been issued."; emails = @($email) }
    }

    if ($action -eq "reject-subscription") {
      $subscription.status = "rejected"
      $subscription.verifiedAt = ""
      $body = @"
Dear $($subscription.subscriberName),

Philotimo Educational Consultancy Services has reviewed your subscription payment proof.

Status: rejected
Subscription: $($subscription.subscriptionType)
Payment reference: $($subscription.paymentReference)

Please contact the office with a clearer proof of payment or corrected payment details so the payment can be verified.
"@
      $email = Add-EmailNotification -State $State -To $subscription.subscriberEmail -Subject "Philotimo subscription payment review" -Body $body -RelatedType "subscription" -RelatedId $subscription.id
      return [pscustomobject]@{ message = "$($subscription.subscriberName)'s subscription proof has been rejected."; emails = @($email) }
    }

    $subscription.status = "pending"
    $subscription.verifiedAt = ""
    $body = @"
Dear $($subscription.subscriberName),

Philotimo Educational Consultancy Services has reopened your subscription payment record for another review.

Subscription: $($subscription.subscriptionType)
Payment reference: $($subscription.paymentReference)

The office will update you once the review is completed.
"@
    $email = Add-EmailNotification -State $State -To $subscription.subscriberEmail -Subject "Philotimo subscription review reopened" -Body $body -RelatedType "subscription" -RelatedId $subscription.id
    return [pscustomobject]@{ message = "$($subscription.subscriberName)'s subscription has been moved back to pending review."; emails = @($email) }
  }

  if ($action -eq "allocate-student") {
    $student = @($State.students | Where-Object { $_.id -eq $id })[0]
    $teacher = @($State.teachers | Where-Object { $_.id -eq $selectedId })[0]
    if (-not $student -or -not $teacher) { throw "Student request or selected teacher was not found." }
    $State.allocations = @($State.allocations | Where-Object { $_.studentId -ne $student.id })
    $State.allocations = @((New-Record @{ studentId = $student.id; teacherId = $teacher.id; studentName = $student.studentName; teacherName = $teacher.teacherName; subject = $student.requestedSubject; studentClass = $student.studentClass; mode = $student.preferredMode; location = $student.lessonLocation })) + @($State.allocations)
    $student.status = "allocated"
    $guardianBody = @"
Dear $($student.guardianName),

Philotimo Educational Consultancy Services has updated the lesson request for $($student.studentName).

Allocated teacher: $($teacher.teacherName)
Subject: $($student.requestedSubject)
Class: $($student.studentClass)
Mode: $($student.preferredMode)
Location: $($student.lessonLocation)

Our office will follow up with the next arrangement.
"@
    $teacherBody = @"
Dear $($teacher.teacherName),

Philotimo Educational Consultancy Services has allocated a learner to you.

Student: $($student.studentName)
Subject: $($student.requestedSubject)
Class: $($student.studentClass)
Mode: $($student.preferredMode)
Location: $($student.lessonLocation)

Please await office confirmation before commencing lessons.
"@
    $emails = @(
      (Add-EmailNotification -State $State -To $student.guardianEmail -Subject "Philotimo lesson allocation update" -Body $guardianBody -RelatedType "student" -RelatedId $student.id),
      (Add-EmailNotification -State $State -To $teacher.teacherEmail -Subject "Philotimo learner allocation" -Body $teacherBody -RelatedType "teacher" -RelatedId $teacher.id)
    )
    return [pscustomobject]@{ message = "$($student.studentName) has been allocated to $($teacher.teacherName)."; emails = $emails }
  }

  if ($action -eq "place-jobseeker") {
    $request = @($State.employerRequests | Where-Object { $_.id -eq $id })[0]
    $jobseeker = @($State.jobseekers | Where-Object { $_.id -eq $selectedId })[0]
    if (-not $request -or -not $jobseeker) { throw "Employer request or selected jobseeker was not found." }
    $State.jobPlacements = @($State.jobPlacements | Where-Object { $_.requestId -ne $request.id })
    $State.jobPlacements = @((New-Record @{ requestId = $request.id; jobseekerId = $jobseeker.id; institutionName = $request.institutionName; jobName = $jobseeker.jobName; roleNeeded = $request.roleNeeded; categoryNeeded = $request.categoryNeeded; employmentType = $request.requestEmploymentType; location = $request.employerLocation })) + @($State.jobPlacements)
    $request.status = "matched"
    $jobseekerBody = @"
Dear $($jobseeker.jobName),

Philotimo Educational Consultancy Services has matched your profile to a request.

Institution/company: $($request.institutionName)
Role: $($request.roleNeeded)
Employment type: $($request.requestEmploymentType)
Location: $($request.employerLocation)

Our office will follow up with the next step.
"@
    $employerBody = @"
Dear $($request.contactPerson),

Philotimo Educational Consultancy Services has matched a candidate to your request.

Candidate: $($jobseeker.jobName)
Role requested: $($request.roleNeeded)
Category: $($request.categoryNeeded)
Employment type: $($request.requestEmploymentType)

Our office will follow up with the next step.
"@
    $emails = @(
      (Add-EmailNotification -State $State -To $jobseeker.jobEmail -Subject "Philotimo job match update" -Body $jobseekerBody -RelatedType "jobseeker" -RelatedId $jobseeker.id),
      (Add-EmailNotification -State $State -To $request.employerEmail -Subject "Philotimo candidate match update" -Body $employerBody -RelatedType "employerRequest" -RelatedId $request.id)
    )
    return [pscustomobject]@{ message = "$($jobseeker.jobName) has been matched to $($request.institutionName)."; emails = $emails }
  }

  if ($action -eq "clear-allocation") {
    $student = @($State.students | Where-Object { $_.id -eq $id })[0]
    $State.allocations = @($State.allocations | Where-Object { $_.studentId -ne $id })
    if ($student) { $student.status = "open" }
    return [pscustomobject]@{ message = "Allocation has been reopened."; emails = @() }
  }

  if ($action -eq "clear-job-placement") {
    $request = @($State.employerRequests | Where-Object { $_.id -eq $id })[0]
    $State.jobPlacements = @($State.jobPlacements | Where-Object { $_.requestId -ne $id })
    if ($request) { $request.status = "open" }
    return [pscustomobject]@{ message = "Jobseeker match has been reopened."; emails = @() }
  }

  throw "Unsupported admin action."
}

function Handle-Api {
  param($Request, [IO.Stream]$Stream)

  $route = $Request.Path -replace "^/api", ""
  if (-not $route) { $route = "/" }

  if ($Request.Method -eq "OPTIONS") {
    Send-Json -Stream $Stream -StatusCode 200 -Body @{ ok = $true }
    return
  }

  if ($route -eq "/health" -and $Request.Method -eq "GET") {
    Send-Json -Stream $Stream -StatusCode 200 -Body @{ ok = $true; service = "Philotimo local backend" }
    return
  }

  if ($route -eq "/admin/login" -and $Request.Method -eq "POST") {
    $payload = Get-BodyJson -Request $Request
    if ((Clean $payload.adminCode) -ne $adminCode) {
      Send-Json -Stream $Stream -StatusCode 401 -Body @{ message = "Administrator access is required." }
      return
    }
    $token = [guid]::NewGuid().ToString("N")
    $sessions[$token] = (Get-Date).AddHours(8)
    Send-Json -Stream $Stream -StatusCode 200 -Body @{ token = $token; expiresInHours = 8 }
    return
  }

  if ($route -eq "/admin/state" -and $Request.Method -eq "GET") {
    if (-not (Test-Admin -Request $Request)) {
      Send-Json -Stream $Stream -StatusCode 401 -Body @{ message = "Administrator access is required." }
      return
    }
    Send-Json -Stream $Stream -StatusCode 200 -Body (Read-State)
    return
  }

  if ($route -eq "/admin/action" -and $Request.Method -eq "POST") {
    if (-not (Test-Admin -Request $Request)) {
      Send-Json -Stream $Stream -StatusCode 401 -Body @{ message = "Administrator access is required." }
      return
    }
    $payload = Get-BodyJson -Request $Request
    $state = Read-State
    $result = Invoke-AdminAction -State $state -Payload $payload
    $saved = Write-State -State $state
    Send-Json -Stream $Stream -StatusCode 200 -Body @{ message = $result.message; emails = @($result.emails); state = $saved }
    return
  }

  if ($Request.Method -ne "POST") {
    Send-Json -Stream $Stream -StatusCode 405 -Body @{ message = "Method not allowed." }
    return
  }

  $state = Read-State
  $payload = Get-BodyJson -Request $Request

  switch ($route) {
    "/contacts" {
      Require-Fields -Payload $payload -Fields @("name", "email", "service", "message")
      $record = New-Record @{ name = Clean $payload.name; email = Clean $payload.email; service = Clean $payload.service; message = Clean $payload.message; status = "new" }
      $state.contacts = @($record) + @($state.contacts)
      Write-State -State $state | Out-Null
      Send-Json -Stream $Stream -StatusCode 201 -Body @{ message = "Thank you, $($record.name). Your enquiry has been submitted."; record = $record }
    }
    "/teachers" {
      Require-Fields -Payload $payload -Fields @("teacherName", "teacherPhone", "teacherEmail", "workplace", "qualification", "experienceYears", "primarySubject", "teachingMode", "coverage", "classLevels")
      $record = New-Record @{ teacherName = Clean $payload.teacherName; teacherPhone = Clean $payload.teacherPhone; teacherEmail = Clean $payload.teacherEmail; workplace = Clean $payload.workplace; qualification = Clean $payload.qualification; experienceYears = Clean $payload.experienceYears; primarySubject = Clean $payload.primarySubject; otherSubjects = Clean $payload.otherSubjects; teachingMode = Clean $payload.teachingMode; coverage = Clean $payload.coverage; classLevels = Clean-Array $payload.classLevels; experienceSummary = Clean $payload.experienceSummary; profileLink = Clean $payload.profileLink; status = "pending" }
      $state.teachers = @($record) + @($state.teachers)
      Write-State -State $state | Out-Null
      Send-Json -Stream $Stream -StatusCode 201 -Body @{ message = "$($record.teacherName)'s application has been submitted for admin approval."; record = $record }
    }
    "/students" {
      Require-Fields -Payload $payload -Fields @("guardianName", "studentName", "guardianPhone", "guardianEmail", "studentClass", "requestedSubject", "preferredMode", "lessonLocation")
      $record = New-Record @{ guardianName = Clean $payload.guardianName; studentName = Clean $payload.studentName; guardianPhone = Clean $payload.guardianPhone; guardianEmail = Clean $payload.guardianEmail; schoolName = Clean $payload.schoolName; studentClass = Clean $payload.studentClass; examTarget = Clean $payload.examTarget; requestedSubject = Clean $payload.requestedSubject; otherRequestedSubjects = Clean $payload.otherRequestedSubjects; preferredMode = Clean $payload.preferredMode; lessonLocation = Clean $payload.lessonLocation; preferredSchedule = Clean $payload.preferredSchedule; learningNeed = Clean $payload.learningNeed; status = "open" }
      $state.students = @($record) + @($state.students)
      $matchCount = Get-TeacherMatchCount -State $state -Student $record
      Write-State -State $state | Out-Null
      Send-Json -Stream $Stream -StatusCode 201 -Body @{ message = "$($record.studentName)'s request has been saved."; record = $record; matchCount = $matchCount }
    }
    "/jobseekers" {
      Require-Fields -Payload $payload -Fields @("jobName", "jobPhone", "jobEmail", "jobLocation", "jobCategory", "preferredRole", "jobQualification", "jobExperienceYears", "availability", "employmentType", "coreSkills")
      $record = New-Record @{ jobName = Clean $payload.jobName; jobPhone = Clean $payload.jobPhone; jobEmail = Clean $payload.jobEmail; jobLocation = Clean $payload.jobLocation; jobCategory = Clean $payload.jobCategory; preferredRole = Clean $payload.preferredRole; jobQualification = Clean $payload.jobQualification; jobExperienceYears = Clean $payload.jobExperienceYears; currentWorkplace = Clean $payload.currentWorkplace; availability = Clean $payload.availability; employmentType = Clean $payload.employmentType; cvLink = Clean $payload.cvLink; coreSkills = Clean $payload.coreSkills; workSummary = Clean $payload.workSummary; status = "pending" }
      $state.jobseekers = @($record) + @($state.jobseekers)
      Write-State -State $state | Out-Null
      Send-Json -Stream $Stream -StatusCode 201 -Body @{ message = "$($record.jobName)'s profile has been submitted for admin vetting."; record = $record }
    }
    "/employer-requests" {
      Require-Fields -Payload $payload -Fields @("institutionName", "contactPerson", "employerPhone", "employerEmail", "institutionType", "employerLocation", "roleNeeded", "categoryNeeded", "experienceNeeded", "requestEmploymentType")
      $record = New-Record @{ institutionName = Clean $payload.institutionName; contactPerson = Clean $payload.contactPerson; employerPhone = Clean $payload.employerPhone; employerEmail = Clean $payload.employerEmail; institutionType = Clean $payload.institutionType; employerLocation = Clean $payload.employerLocation; roleNeeded = Clean $payload.roleNeeded; categoryNeeded = Clean $payload.categoryNeeded; minimumQualification = Clean $payload.minimumQualification; experienceNeeded = Clean $payload.experienceNeeded; requestEmploymentType = Clean $payload.requestEmploymentType; startDate = Clean $payload.startDate; requestNotes = Clean $payload.requestNotes; status = "open" }
      $state.employerRequests = @($record) + @($state.employerRequests)
      $matchCount = Get-JobseekerMatchCount -State $state -Request $record
      Write-State -State $state | Out-Null
      Send-Json -Stream $Stream -StatusCode 201 -Body @{ message = "$($record.institutionName)'s request has been saved."; record = $record; matchCount = $matchCount }
    }
    "/subscriptions" {
      Require-Fields -Payload $payload -Fields @("subscriberName", "subscriberEmail", "subscriberPhone", "subscriptionType", "amountPaid", "paymentReference", "paymentDate", "proofFileName", "proofFileType", "proofDataUrl")
      $record = New-Record @{
        subscriberName = Clean $payload.subscriberName
        subscriberEmail = Clean $payload.subscriberEmail
        subscriberPhone = Clean $payload.subscriberPhone
        subscriptionType = Clean $payload.subscriptionType
        amountPaid = Clean $payload.amountPaid
        paymentReference = Clean $payload.paymentReference
        paymentDate = Clean $payload.paymentDate
        proofFileName = Clean $payload.proofFileName
        proofFileType = Clean $payload.proofFileType
        proofFileSize = Clean $payload.proofFileSize
        proofDataUrl = Clean $payload.proofDataUrl
        subscriptionNotes = Clean $payload.subscriptionNotes
        status = "pending"
        receiptNumber = ""
        verifiedAt = ""
      }
      $state.subscriptions = @($record) + @($state.subscriptions)
      Write-State -State $state | Out-Null
      Send-Json -Stream $Stream -StatusCode 201 -Body @{ message = "$($record.subscriberName), your subscription and proof of payment have been submitted for admin verification."; record = $record }
    }
    default {
      Send-Json -Stream $Stream -StatusCode 404 -Body @{ message = "API route not found." }
    }
  }
}

function Serve-Static {
  param($Request, [IO.Stream]$Stream)

  if ($Request.Method -notin @("GET", "HEAD")) {
    Send-Text -Stream $Stream -StatusCode 405 -Text "Method not allowed"
    return
  }

  $path = $Request.Path.TrimStart("/")
  if ([string]::IsNullOrWhiteSpace($path)) { $path = "index.html" }
  $path = $path -replace "/", [IO.Path]::DirectorySeparatorChar
  $target = [IO.Path]::GetFullPath((Join-Path $root $path))

  if (-not $target.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
    Send-Text -Stream $Stream -StatusCode 403 -Text "Forbidden"
  } elseif (Test-Path -LiteralPath $target -PathType Leaf) {
    $body = [IO.File]::ReadAllBytes($target)
    Write-HttpResponse -Stream $Stream -StatusCode 200 -ContentType (Get-MimeType -Path $target) -Body $body -HeadOnly:($Request.Method -eq "HEAD")
  } else {
    Send-Text -Stream $Stream -StatusCode 404 -Text "File not found"
  }
}

$server.Start()
Write-Host "Philotimo Consultancy local site running at http://localhost:$Port/"
Write-Host "Admin code: $adminCode"
Write-Host "Local data: $DataPath"

try {
  while ($true) {
    $client = $server.AcceptTcpClient()
    $client.ReceiveTimeout = 3000
    $client.SendTimeout = 3000
    try {
      $stream = $client.GetStream()
      $request = Read-HttpRequest -Stream $stream
      if (-not $request) { continue }

      if ($request.Path.StartsWith("/api")) {
        Handle-Api -Request $request -Stream $stream
      } else {
        Serve-Static -Request $request -Stream $stream
      }
    } catch {
      if ($stream) { Send-Json -Stream $stream -StatusCode 400 -Body @{ message = $_.Exception.Message } }
    } finally {
      $client.Close()
    }
  }
} finally {
  $server.Stop()
}
