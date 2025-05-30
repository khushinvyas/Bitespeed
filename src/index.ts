import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Types
interface IdentifyRequest {
  email?: string;
  phoneNumber?: string;
}

interface ContactResponse {
  contact: {
    primaryContatctId: number;
    emails: string[];
    phoneNumbers: string[];
    secondaryContactIds: number[];
  };
}

// Helper function to get all linked contacts
async function getAllLinkedContacts(contactId: number) {
  const contacts = await prisma.contact.findMany({
    where: {
      OR: [
        { id: contactId },
        { linkedId: contactId },
        {
          linkedContact: {
            OR: [
              { id: contactId },
              { linkedId: contactId }
            ]
          }
        }
      ],
      deletedAt: null
    },
    orderBy: {
      createdAt: 'asc'
    }
  });

  return contacts;
}

// Helper function to find primary contact
function findPrimaryContact(contacts: any[]) {
  const primary = contacts.find(c => c.linkPrecedence === 'primary');
  return primary || contacts[0];
}

// Helper function to consolidate contact data
function consolidateContacts(contacts: any[]) {
  const primary = findPrimaryContact(contacts);
  const secondary = contacts.filter(c => c.id !== primary.id);

  const emails = [...new Set(contacts.map(c => c.email).filter(Boolean))];
  const phoneNumbers = [...new Set(contacts.map(c => c.phoneNumber).filter(Boolean))];

  // Ensure primary contact's email and phone are first
  if (primary.email && emails.includes(primary.email)) {
    emails.splice(emails.indexOf(primary.email), 1);
    emails.unshift(primary.email);
  }
  if (primary.phoneNumber && phoneNumbers.includes(primary.phoneNumber)) {
    phoneNumbers.splice(phoneNumbers.indexOf(primary.phoneNumber), 1);
    phoneNumbers.unshift(primary.phoneNumber);
  }

  return {
    primaryContatctId: primary.id,
    emails,
    phoneNumbers,
    secondaryContactIds: secondary.map(c => c.id)
  };
}

// Main identify endpoint
app.post('/identify', async (req: express.Request, res: express.Response) => {
  try {
    const { email, phoneNumber }: IdentifyRequest = req.body;

    // Validate input - at least one of email or phoneNumber must be provided
    if (!email && !phoneNumber) {
      return res.status(400).json({ error: 'Either email or phoneNumber must be provided' });
    }

    // Find existing contacts that match email or phoneNumber
    const existingContacts = await prisma.contact.findMany({
      where: {
        OR: [
          email ? { email } : {},
          phoneNumber ? { phoneNumber } : {}
        ].filter(condition => Object.keys(condition).length > 0),
        deletedAt: null
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    if (existingContacts.length === 0) {
      // No existing contacts - create new primary contact
      const newContact = await prisma.contact.create({
        data: {
          email,
          phoneNumber,
          linkPrecedence: 'primary'
        }
      });

      return res.json({
        contact: {
          primaryContatctId: newContact.id,
          emails: newContact.email ? [newContact.email] : [],
          phoneNumbers: newContact.phoneNumber ? [newContact.phoneNumber] : [],
          secondaryContactIds: []
        }
      });
    }

    // Get all contacts related to the found contacts
    const allRelatedContactIds = new Set<number>();
    for (const contact of existingContacts) {
      const primaryId = contact.linkedId || contact.id;
      allRelatedContactIds.add(primaryId);
    }

    const allLinkedContacts = await prisma.contact.findMany({
      where: {
        OR: [
          { id: { in: Array.from(allRelatedContactIds) } },
          { linkedId: { in: Array.from(allRelatedContactIds) } }
        ],
        deletedAt: null
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    // Check if this is new information
    const exactMatch = allLinkedContacts.find(c => 
      c.email === email && c.phoneNumber === phoneNumber
    );

    if (!exactMatch) {
      // Check if we need to link two separate primary contacts
      const emailContact = email ? allLinkedContacts.find(c => c.email === email) : null;
      const phoneContact = phoneNumber ? allLinkedContacts.find(c => c.phoneNumber === phoneNumber) : null;

      if (emailContact && phoneContact && 
          (emailContact.linkedId || emailContact.id) !== (phoneContact.linkedId || phoneContact.id)) {
        
        // We need to merge two separate contact groups
        const emailPrimaryId = emailContact.linkedId || emailContact.id;
        const phonePrimaryId = phoneContact.linkedId || phoneContact.id;
        
        // Make the older one primary
        const emailPrimary = allLinkedContacts.find(c => c.id === emailPrimaryId);
        const phonePrimary = allLinkedContacts.find(c => c.id === phonePrimaryId);
        
        let olderPrimary, newerPrimary;
        if (emailPrimary!.createdAt <= phonePrimary!.createdAt) {
          olderPrimary = emailPrimary;
          newerPrimary = phonePrimary;
        } else {
          olderPrimary = phonePrimary;
          newerPrimary = emailPrimary;
        }

        // Update the newer primary to become secondary
        await prisma.contact.update({
          where: { id: newerPrimary!.id },
          data: {
            linkedId: olderPrimary!.id,
            linkPrecedence: 'secondary'
          }
        });

        // Update all contacts linked to newer primary
        await prisma.contact.updateMany({
          where: { linkedId: newerPrimary!.id },
          data: { linkedId: olderPrimary!.id }
        });

        // Create new secondary contact if it doesn't exist
        const newContact = await prisma.contact.create({
          data: {
            email,
            phoneNumber,
            linkedId: olderPrimary!.id,
            linkPrecedence: 'secondary'
          }
        });

        // Get updated contacts
        const updatedContacts = await prisma.contact.findMany({
          where: {
            OR: [
              { id: olderPrimary!.id },
              { linkedId: olderPrimary!.id }
            ],
            deletedAt: null
          },
          orderBy: { createdAt: 'asc' }
        });

        return res.json({
          contact: consolidateContacts(updatedContacts)
        });
      }

      // Create new secondary contact
      const primary = findPrimaryContact(allLinkedContacts);
      const newContact = await prisma.contact.create({
        data: {
          email,
          phoneNumber,
          linkedId: primary.id,
          linkPrecedence: 'secondary'
        }
      });

      allLinkedContacts.push(newContact);
    }

    // Return consolidated response
    return res.json({
      contact: consolidateContacts(allLinkedContacts)
    });

  } catch (error) {
    console.error('Error in /identify endpoint:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});