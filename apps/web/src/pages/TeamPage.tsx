import { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Github, Linkedin, Twitter, Instagram, Loader2 } from 'lucide-react';
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
      <section className="py-16 bg-gradient-to-br from-amber-400 via-orange-500 to-amber-900 text-white relative overflow-hidden">
        {/* Animated background particles */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 bg-white/20 rounded-full"
              initial={{ 
                x: Math.random() * 100 + '%', 
                y: Math.random() * 100 + '%',
                scale: Math.random() * 0.5 + 0.5
              }}
              animate={{ 
                y: [null, '-100%'],
                opacity: [0, 1, 0]
              }}
              transition={{ 
                duration: Math.random() * 3 + 2,
                repeat: Infinity,
                delay: Math.random() * 2
              }}
            />
          ))}
        </div>
        
        <div className="container mx-auto px-4 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-center"
          >
            <motion.h1 
              className="text-5xl md:text-6xl font-bold mb-4"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              Our Team
            </motion.h1>
            <motion.p 
              className="text-xl text-amber-50 max-w-2xl mx-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              The passionate individuals driving code.scriet forward
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Filter Tabs */}
      {teams.length > 1 && (
        <section className="py-8 bg-white/90 backdrop-blur-sm border-b border-amber-200 sticky top-[73px] z-40">
          <div className="container mx-auto px-4">
            <motion.div 
              className="flex flex-wrap justify-center gap-3"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              {teams.map((team, index) => (
                <motion.div
                  key={team}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <Button
                    variant={activeTeam === team ? 'default' : 'outline'}
                    onClick={() => setActiveTeam(team)}
                    className={`min-w-24 transition-all duration-300 ${
                      activeTeam === team 
                        ? 'shadow-lg shadow-amber-500/30 scale-105' 
                        : 'hover:scale-105 hover:shadow-md'
                    }`}
                  >
                    {team}
                  </Button>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>
      )}

      {/* Team Grid */}
      <section className="py-16 bg-gradient-to-b from-amber-50 to-orange-50/50 min-h-[60vh]">
        <div className="container mx-auto px-4">
          {loading ? (
            <motion.div 
              className="flex justify-center items-center py-20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="relative">
                <Loader2 className="h-12 w-12 animate-spin text-amber-600" />
                <div className="absolute inset-0 h-12 w-12 animate-ping bg-amber-400/30 rounded-full" />
              </div>
            </motion.div>
          ) : error ? (
            <motion.div 
              className="text-center py-20"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <p className="text-red-500 mb-4">{error}</p>
              <Button onClick={() => window.location.reload()} className="mt-4">
                Try Again
              </Button>
            </motion.div>
          ) : filteredMembers.length === 0 ? (
            <motion.div 
              className="text-center py-20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <p className="text-gray-500 text-lg">No team members yet. Check back soon!</p>
            </motion.div>
          ) : activeTeam !== 'All' ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTeam}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
              >
                <motion.h2 
                  className="text-3xl font-bold text-amber-900 mb-12 text-center"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {activeTeam} Team
                </motion.h2>
                <TeamGrid 
                  members={filteredMembers.sort((a, b) => (a.order || 0) - (b.order || 0))} 
                />
              </motion.div>
            </AnimatePresence>
          ) : (
            <>
              {teams.slice(1).map((teamName, teamIndex) => {
                const members = filteredMembers.filter(m => m.team === teamName);
                if (members.length === 0) return null;
                return (
                  <motion.div
                    key={teamName}
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: teamIndex * 0.15 }}
                    viewport={{ once: true, margin: "-50px" }}
                    className="mb-20"
                  >
                    <motion.h2 
                      className="text-3xl font-bold text-amber-900 mb-12 text-center relative"
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      viewport={{ once: true }}
                    >
                      <span className="relative">
                        {teamName} Team
                        <motion.div 
                          className="absolute -bottom-2 left-1/2 -translate-x-1/2 h-1 bg-gradient-to-r from-amber-400 to-orange-500 rounded-full"
                          initial={{ width: 0 }}
                          whileInView={{ width: '60%' }}
                          transition={{ duration: 0.6, delay: 0.3 }}
                          viewport={{ once: true }}
                        />
                      </span>
                    </motion.h2>
                    <TeamGrid 
                      members={members.sort((a, b) => (a.order || 0) - (b.order || 0))} 
                    />
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

// Component to handle the centered grid layout with animations spreading from center
function TeamGrid({ members }: { members: TeamMember[] }) {
  const totalMembers = members.length;
  
  // Calculate animation delay based on position from center
  const getAnimationDelay = (index: number) => {
    const centerIndex = (totalMembers - 1) / 2;
    const distanceFromCenter = Math.abs(index - centerIndex);
    return distanceFromCenter * 0.12;
  };

  // Calculate horizontal offset for center-out animation
  const getInitialX = (index: number) => {
    const centerIndex = (totalMembers - 1) / 2;
    const position = index - centerIndex;
    return position > 0 ? 60 : position < 0 ? -60 : 0;
  };

  return (
    <div className="flex flex-wrap justify-center gap-8 md:gap-12 max-w-5xl mx-auto">
      {members.map((member, index) => (
        <MemberCard 
          key={member.id} 
          member={member} 
          delay={getAnimationDelay(index)}
          initialX={getInitialX(index)}
        />
      ))}
    </div>
  );
}

function MemberCard({ 
  member, 
  delay = 0,
  initialX = 0 
}: { 
  member: TeamMember; 
  delay?: number;
  initialX?: number;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, x: initialX, y: 30, scale: 0.8 }}
      whileInView={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ 
        duration: 0.6, 
        delay: delay,
        ease: [0.25, 0.46, 0.45, 0.94]
      }}
      whileHover={{ y: -8 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="text-center w-36 md:w-44"
    >
      {/* Card with glassmorphism effect */}
      <div className="relative p-4 rounded-2xl bg-white/60 backdrop-blur-sm border border-white/80 shadow-lg hover:shadow-2xl hover:shadow-amber-500/20 transition-all duration-500 group">
        {/* Animated gradient border on hover */}
        <motion.div
          className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            background: 'linear-gradient(135deg, rgba(251,191,36,0.3), rgba(249,115,22,0.3), rgba(251,191,36,0.3))',
            backgroundSize: '200% 200%',
          }}
          animate={isHovered ? {
            backgroundPosition: ['0% 50%', '100% 50%', '0% 50%']
          } : {}}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        />
        
        {/* Avatar container */}
        <div className="relative mb-4 z-10">
          <motion.div 
            className="w-24 h-24 md:w-28 md:h-28 mx-auto rounded-full overflow-hidden relative"
            whileHover={{ scale: 1.05 }}
            transition={{ duration: 0.3 }}
          >
            {/* Animated ring */}
            <motion.div 
              className="absolute inset-0 rounded-full"
              style={{
                background: 'linear-gradient(135deg, #fbbf24, #f97316, #fbbf24)',
                backgroundSize: '200% 200%',
                padding: '3px',
              }}
              animate={isHovered ? {
                backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
              } : {}}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            >
              <div className="w-full h-full rounded-full bg-white p-0.5">
                <img
                  src={member.imageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.name}`}
                  alt={member.name}
                  className="w-full h-full object-cover rounded-full transition-transform duration-500 group-hover:scale-110"
                />
              </div>
            </motion.div>
            
            {/* Glow effect on hover */}
            <motion.div
              className="absolute inset-0 rounded-full bg-amber-400/30 blur-xl -z-10"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={isHovered ? { opacity: 1, scale: 1.2 } : { opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.4 }}
            />
          </motion.div>
        </div>
        
        {/* Member info */}
        <motion.h3 
          className="font-bold text-amber-900 text-lg mb-1 relative z-10"
          animate={isHovered ? { scale: 1.02 } : { scale: 1 }}
          transition={{ duration: 0.2 }}
        >
          {member.name}
        </motion.h3>
        <motion.p 
          className="text-sm text-gray-600 mb-3 relative z-10"
          initial={{ opacity: 0.8 }}
          animate={isHovered ? { opacity: 1 } : { opacity: 0.8 }}
        >
          {member.role}
        </motion.p>
        
        {/* Social links with staggered animation */}
        <motion.div 
          className="flex justify-center gap-3 relative z-10"
          initial={{ opacity: 0.6 }}
          animate={isHovered ? { opacity: 1 } : { opacity: 0.6 }}
          transition={{ duration: 0.3 }}
        >
          {member.github && (
            <SocialLink 
              href={`https://github.com/${member.github}`}
              icon={<Github className="h-4 w-4" />}
              hoverColor="hover:text-gray-800 hover:bg-gray-100"
              delay={0}
            />
          )}
          {member.linkedin && (
            <SocialLink 
              href={`https://linkedin.com/in/${member.linkedin}`}
              icon={<Linkedin className="h-4 w-4" />}
              hoverColor="hover:text-blue-600 hover:bg-blue-50"
              delay={0.05}
            />
          )}
          {member.twitter && (
            <SocialLink 
              href={`https://twitter.com/${member.twitter}`}
              icon={<Twitter className="h-4 w-4" />}
              hoverColor="hover:text-sky-500 hover:bg-sky-50"
              delay={0.1}
            />
          )}
          {member.instagram && (
            <SocialLink 
              href={`https://instagram.com/${member.instagram}`}
              icon={<Instagram className="h-4 w-4" />}
              hoverColor="hover:text-pink-500 hover:bg-pink-50"
              delay={0.15}
            />
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}

function SocialLink({ 
  href, 
  icon, 
  hoverColor,
  delay 
}: { 
  href: string; 
  icon: React.ReactNode; 
  hoverColor: string;
  delay: number;
}) {
  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`p-2 rounded-full text-gray-400 transition-all duration-300 ${hoverColor}`}
      whileHover={{ scale: 1.2, rotate: 5 }}
      whileTap={{ scale: 0.9 }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      {icon}
    </motion.a>
  );
}
