import Head from 'next/head'
import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'

export default function Home() {
  const router = useRouter()
  const [inviteCode, setInviteCode] = useState('')
  const currentUserMail = "rvleeuwen@digitalindividuals.com"

  const joinRoom = async () => {
    const jsonBody = JSON.stringify({
      email: currentUserMail,
      inviteCode: inviteCode
    });
    let response = await fetch(`${process.env.NEXT_PUBLIC_WEBAPI_URL}/api/meetings/join`, {
      method: "POST",
      body: jsonBody,
      headers: {
        "Content-Type": "application/json"
      }
    })
    if (!response.ok) {
      if (response.status === 400) {
        toast.error("Forbidden: You are not allowed to join this meeting.");
      } else {
        toast.error(`Error: ${await response.text}`);
      }
      return;
    }

    router.push(`/meeting/${inviteCode}`)
  }
  return (
    <div className="bg-gray-100 min-h-screen flex justify-center items-center p-4">
      <div className="w-full max-w-4xl">
        <div className="flex justify-center items-center">
          <img src="/div.png" alt="Meeting Logo" className="mb-8 object-contain w-48 h-36" />
        </div>

        <div className="flex flex-wrap justify-between gap-4">
          <div className="flex-1 min-w-full md:min-w-0 bg-white p-6 m-2 rounded-xl shadow-md">
            <label className="text-base text-gray-700 mb-2 block">
              Please enter the invite ID that you may have received by mail or in person
            </label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Enter invite Code"
              className="w-full my-3 py-3 px-4 border border-gray-300 rounded-lg text-base bg-gray-50 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex justify-center mt-4">
              <button
                onClick={joinRoom}
                className="bg-blue-500 text-white py-2 px-6 rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-700 w-24"
              >
                Join
              </button>
            </div>
          </div>

          <div className="flex-1 min-w-full md:min-w-0 bg-white p-6 m-2 rounded-xl shadow-md">
            <label className="text-base text-gray-700 mb-2 block">
              Or create the meeting yourself
            </label>
            <button
              onClick={() => router.push("/create")}
              className="bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-700 w-full"
            >
              Create Meeting
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}