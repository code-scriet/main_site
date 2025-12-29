import { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Github, Linkedin, Twitter, Loader2 } from 'lucide-react';
import { api, type TeamMember } from '@/lib/api';

export default function TeamPage() {
  const [activeTeam, setActiveTeam] = useState('All');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTeam = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getTeam();
        setTeamMembers(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load team');
      } finally {
        setLoading(false);
      }
    };
    fetchTeam();
  }, []);

  // Get unique teams from data
  const teams = ['All', ...new Set(teamMembers.map(m => m.team))];

  const filteredMembers = activeTeam === 'All'
    ? teamMembers
    : teamMembers.filter(member => member.team === activeTeam);

  return (
    <Layout>
      {/* Hero Section */}
      <section className="py-16 bg-gradient-to-br from-amber-400 via-orange-500 to-amber-900 text-white">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <h1 className="text-5xl font-bold mb-4">Our Team</h1>
            <p className="text-xl text-amber-50 max-w-2xl mx-auto">
              The passionate individuals driving code.scriet forward
            </p>
          </motion.div>
        </div>
      </section>

      {/* Filter Tabs */}
      {teams.length > 1 && (
        <section className="py-8 bg-white border-b border-amber-200 sticky top-[73px] z-40">
          <div className="container mx-auto px-4">
            <div className="flex flex-wrap justify-center gap-2">
              {teams.map((team) => (
                <Button
                  key={team}
                  variant={activeTeam === team ? 'default' : 'outline'}
                  onClick={() => setActiveTeam(team)}
                  className="min-w-24"
                >
                  {team}
                </Button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Team Grid */}
      <section className="py-12 bg-amber-50 min-h-[60vh]">
        <div className="container mx-auto px-4">
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <p className="text-red-500">{error}</p>
              <Button onClick={() => window.location.reload()} className="mt-4">
                Try Again
              </Button>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-gray-500 text-lg">No team members yet. Check back soon!</p>
            </div>
          ) : activeTeam !== 'All' ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              <h2 className="text-2xl font-bold text-amber-900 mb-8 text-center">
                {activeTeam} Team
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 max-w-4xl mx-auto">
                {filteredMembers
                  .sort((a, b) => (a.order || 0) - (b.order || 0))
                  .map((member, index) => (
                    <MemberCard key={member.id} member={member} index={index} />
                  ))}
              </div>
            </motion.div>
          ) : (
            <>
              {teams.slice(1).map((teamName) => {
                const members = filteredMembers.filter(m => m.team === teamName);
                if (members.length === 0) return null;
                return (
                  <motion.div
                    key={teamName}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    viewport={{ once: true }}
                    className="mb-12"
                  >
                    <h2 className="text-2xl font-bold text-amber-900 mb-8 text-center">
                      {teamName} Team
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 max-w-4xl mx-auto">
                      {members
                        .sort((a, b) => (a.order || 0) - (b.order || 0))
                        .map((member, index) => (
                          <MemberCard key={member.id} member={member} index={index} />
                        ))}
                    </div>
                  </motion.div>
                );
              })}
            </>
          )}
        </div>
      </section>
    </Layout>
  );
}

function MemberCard({ member, index }: { member: TeamMember; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      className="text-center group"
    >
      <div className="relative mb-4">
        <div className="w-24 h-24 md:w-32 md:h-32 mx-auto rounded-full overflow-hidden ring-4 ring-amber-200 group-hover:ring-amber-400 transition-all duration-300">
          <img
            src={member.imageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.name}`}
            alt={member.name}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
          />
        </div>
      </div>
      <h3 className="font-semibold text-amber-900">{member.name}</h3>
      <p className="text-sm text-gray-600 mb-2">{member.role}</p>
      <div className="flex justify-center gap-2">
        {member.github && (
          <a
            href={`https://github.com/${member.github}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Github className="h-4 w-4" />
          </a>
        )}
        {member.linkedin && (
          <a
            href={`https://linkedin.com/in/${member.linkedin}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-blue-600 transition-colors"
          >
            <Linkedin className="h-4 w-4" />
          </a>
        )}
        {member.twitter && (
          <a
            href={`https://twitter.com/${member.twitter}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-sky-500 transition-colors"
          >
            <Twitter className="h-4 w-4" />
          </a>
        )}
      </div>
    </motion.div>
  );
}
