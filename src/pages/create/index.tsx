import React, { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Modal from '@/components/modal';
import { toast } from 'sonner';
export default function CreateMeeting() {
  const [title, setTitle] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [invitees, setInvitees] = useState([]);
  const [showRoomCreatedModal, setShowRoomCreatedModal] = useState(false);
  const [meetingDetails, setMeetingDetails] = useState(null);
  const router = useRouter();

  const MICROSOFT_USERS = [
    { name: "Benjamin Elbersen", email: "belbersen@digitalindividuals.com" },
    { name: "Dirk Nuijs", email: "dnuijs@digitalindividuals.com" },
    { name: "Rose van Leeuwen", email: "rvleeuwen@digitalindividuals.com" },
    { name: "Liv Knapen", email: "lknapen@digitalindividuals.com" },
    { name: "Stijn Charmant", email: "scharmant@digitalindividuals.com" },
    { name: "Daan Spronk", email: "dspronk@digitalindividuals.com" },
  ];

  const filteredUsers = MICROSOFT_USERS.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const addInvitee = (user) => {
    if (!invitees.find(i => i.email === user.email)) {
      setInvitees([...invitees, user]);
    }
  };

  const createMeeting = async () => {
    let createdMeeting;
    const jsonBody = JSON.stringify({
      name: title,
      participants: invitees.map(({ email }) => (email))
    });
    console.log(process.env.NEXT_PUBLIC_WEBAPI_URL+"/api/meetings")

    try {
      const response = await fetch(process.env.NEXT_PUBLIC_WEBAPI_URL+"/api/meetings", {
        method: "POST",
        body: jsonBody,
        headers: {
          "Content-Type": "application/json"
        }
      });

      createdMeeting = await response.json();
      if (createdMeeting) {
        setMeetingDetails(createdMeeting);
        setShowRoomCreatedModal(true);
      } else {
        toast("Failed to create meeting. Please try again.");
      }
    } catch (exception) {
      console.log("Error creating meeting:", exception);
    }
  };

  const joinMeetingNow = () => {
    setShowRoomCreatedModal(false);
    if (meetingDetails && meetingDetails.meetingId && meetingDetails.name && meetingDetails.inviteCode) {
      try {
        router.push({
          pathname: `/meeting/${meetingDetails.inviteCode}`,
        });
      } catch (exception) {
        console.error("Navigation error:", exception);
        toast("Error navigating: " + exception.message);
      }
    } else {
      console.log("Meeting details missing required properties");
      if (!meetingDetails) console.log("meetingDetails is undefined");
      else {
        console.log("Available properties:", Object.keys(meetingDetails));
        console.log("id present:", Boolean(meetingDetails.meetingId));
        console.log("name present:", Boolean(meetingDetails.name));
      }
      alert("Meeting details are not available");
    }
  };

  const copyToClipboard = async () => {
    if (meetingDetails && meetingDetails.inviteCode) {
      try {
        await navigator.clipboard.writeText(meetingDetails.inviteCode);
        toast("Invite code copied to clipboard!");
      } catch (err) {
        console.error('Failed to copy: ', err);
        alert("Failed to copy invite code");
      }
    } else {
      alert("No invite code available to copy");
    }
  };

  return (
    <>
      <Head>
        <title>Create Meeting</title>
        <meta name="description" content="Create a new meeting" />
      </Head>

      <div className="bg-gray-100 min-h-screen p-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className='font-bold text-3xl mb-5'>Create meeting</h1>
            <label className="block text-lg mb-2">Title</label>
            <input
              className="w-full bg-white rounded-lg p-3 mb-4"
              placeholder="Enter meeting title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required={true}
            />
          </div>

          <div className="mb-6">
            <label className="block text-lg mb-2">Invite Participants</label>
            <input
              className="w-full bg-white rounded-lg p-3 mb-4"
              placeholder="Search by name or email"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

            <div className="mb-6">
              {filteredUsers.map(user => (
                <div key={user.email} className="flex items-center justify-between mb-2 p-2 border-b">
                  <span className="flex-1">{user.name} ({user.email})</span>
                  <button
                    onClick={() => addInvitee(user)}
                    className="bg-blue-500 text-white px-4 py-1 rounded hover:bg-blue-600"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          </div>

          {invitees.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-bold mb-2">Participants that will be invited</h3>
              {invitees.map(inv => (
                <div key={inv.email} className="py-1">
                  {inv.name} ({inv.email})
                </div>
              ))}
            </div>
          )}

          <button
            onClick={createMeeting}
            className="w-full bg-blue-500 text-white p-3 rounded-lg hover:bg-blue-600"
          >
            Create Meeting
          </button>
        </div>
      </div>

      <Modal
        isOpen={showRoomCreatedModal}
        onClose={() => setShowRoomCreatedModal(false)}
      >
        <h2 className="text-xl font-bold text-center mb-4">Meeting Created Successfully</h2>

        <div className="border-b pb-2 mb-3 flex justify-between">
          <span className="font-semibold text-gray-700">Meeting name:</span>
          <span className="text-right max-w-xs">{meetingDetails?.name}</span>
        </div>

        <div className="border-b pb-2 mb-3 flex justify-between">
          <span className="font-semibold text-gray-700">Invite code:</span>
          <span className="text-right max-w-xs">{meetingDetails?.inviteCode}</span>
        </div>

        <div className="mb-4">
          <span className="font-semibold text-gray-700">Participants:</span>
          <div className="mt-1 pl-2">
            {meetingDetails?.participants?.map((p, index) => (
              <div key={index} className="mb-1">
                • {p.split('@')[0]}
              </div>
            ))}
          </div>
        </div>

        <h3 className="text-lg font-semibold text-center mb-3">What would you like to do?</h3>

        <div className="flex gap-3">
          <button
            onClick={joinMeetingNow}
            className="flex-1 bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
          >
            Join Meeting Now
          </button>
          <button
            onClick={copyToClipboard}
            className="flex-1 bg-gray-200 p-2 rounded hover:bg-gray-300"
          >
            Copy Invite Code
          </button>
        </div>
      </Modal>
    </>
  );
}