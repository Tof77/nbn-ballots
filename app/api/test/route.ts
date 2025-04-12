import { NextResponse } from "next/server"
export async function GET() {
  return NextResponse.json({ status : "API test is working" })
}
export async function POST() {
  return NextResponse.json({ status : "POST request received successfully" })
}
