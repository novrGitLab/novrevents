export const guides = [
  {
    slug: 'workshops',
    title: 'Hands-on workshops',
    image: 'workshop',
    alt: 'Participants drawing ink across a screen-printing frame',
    action: 'Find workshops',
    filter: 'type=WORKSHOP',
    intro:
      'Learn a process from someone who practises it. A small workshop leaves room to ask questions, compare techniques and come home with something you made.',
    sections: [
      [
        'Choose the right level',
        'Look for the experience the facilitator expects, the group size and the time set aside to practise. For a first session, a single technique and a small group usually give you more time with the instructor.',
      ],
      [
        'Know what to bring',
        'Check the event description for materials, protective clothing, a laptop or software. Ask the organizer whether the ticket covers shared supplies and whether finished work can travel home the same day.',
      ],
      [
        'Leave time for the whole session',
        'A demonstration at the start often explains the rest of the workshop. Check the venue entrance and arrival time before you set out.',
      ],
    ],
  },
  {
    slug: 'conferences',
    title: 'Conferences & talks',
    image: 'cyber',
    alt: 'A conference speaker addressing a seated audience',
    action: 'Browse conferences',
    filter: 'type=CONFERENCE',
    intro:
      'Build a day around the conversations that matter. Compare tracks, speakers and formats before choosing a seat or joining online.',
    sections: [
      [
        'Read the programme by track',
        'Start with the sessions you most want to attend, then compare their times. Leave room between rooms or buildings, particularly when a talk finishes with audience questions.',
      ],
      [
        'Find your community',
        'A focused meetup can be a better setting for a detailed question. Browse the organizer profile and follow groups whose topics match your work.',
      ],
      [
        'Joining remotely',
        'Check the listed time zone, access instructions and whether a recording is available. Keep your confirmation handy when a session is restricted to registered attendees.',
      ],
    ],
  },
  {
    slug: 'arts-and-culture',
    title: 'Arts & culture',
    image: 'culture',
    alt: 'Gallery visitors looking up at a suspended textile installation',
    action: 'Explore arts events',
    filter: 'category=arts-culture',
    intro:
      'See a new exhibition, hear the story behind a work or discover a space through the people who programme it.',
    sections: [
      [
        'An opening or a visit',
        'An opening reception has a gathering time. A gallery show may run across several days. Check which date your registration covers and whether the venue uses timed entry.',
      ],
      [
        'Inside the venue',
        'Check access, photography guidance and the programme before arriving. For a performance, look for doors and start times so you can settle in before the lights change.',
      ],
      [
        'Follow the programme',
        'Open the organizer page to find other public events from the same host. Saving an event keeps it in your shortlist until you are ready to register.',
      ],
    ],
  },
  {
    slug: 'celebrations',
    title: 'Weddings & anniversaries',
    image: 'wedding',
    alt: 'A couple dancing at their Yoruba wedding reception among family and friends',
    action: 'Plan a celebration',
    filter: '',
    intro:
      'A wedding, a naming ceremony or a golden anniversary has its own rhythm. Give family and friends one place to find the invitation details and reply.',
    sections: [
      [
        'Make the invitation practical',
        'List the ceremony and reception separately when guests will travel between them. Include arrival times, landmarks and a contact for directions. Keep a private family occasion off the public directory.',
      ],
      [
        'Ask what the hosts need',
        'Use the RSVP form to confirm attendance, meal requirements and accessibility arrangements. If the invitation allows additional guests, make the number of places explicit.',
      ],
      [
        'Give the day a running order',
        'Share the moments guests need to plan around, from a group photograph to the last shuttle. Assign someone at the entrance who can help guests find their table.',
      ],
    ],
  },
] as const
