import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Github, Linkedin, Twitter, Instagram, Loader2 } from 'lucide-react';
import { api, type TeamMember } from '@/lib/api';
import { useMotionConfig } from '@/hooks/useMotionConfig';

type TeamParticle = {
  id: number;
  left: string;
  top: string;
  scale: number;
  duration: number;
  delay: number;
};

function buildTeamParticles(count: number): TeamParticle[] {
  return Array.from({ length: count }, (_, index) => {
    const seed = index + 1;
    return {
      id: seed,
      left: `${(seed * 31) % 100}%`,
      top: `${(seed * 47) % 100}%`,
      scale: 0.45 + ((seed * 13) % 50) / 100,
      duration: 2.8 + ((seed * 17) % 26) / 10,
      delay: ((seed * 23) % 20) / 10,
    };
  });
}

export default function TeamPage() {
  const [activeTeam, setActiveTeam] = useState('All');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isMobile, prefersReducedMotion, shouldReduceMotion } = useMotionConfig();
  const heroParticles = useMemo(() => buildTeamParticles(isMobile ? 10 : 20), [isMobile]);

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
      <SEO 
        title="Our Team"
        description="Meet the passionate team behind code.scriet - the talented individuals driving SCRIET's premier coding community forward."
        url="/team"
        keywords="code.scriet team, SCRIET coding club members, coding club leadership"
      />
      {/* Hero Section */}
      <section className="py-14 sm:py-16 bg-gradient-to-br from-amber-400 via-orange-500 to-amber-900 text-white relative overflow-hidden">
        {/* Animated background particles */}
        <div className="absolute inset-0 overflow-hidden">
          {heroParticles.map((particle) => (
            <motion.div
              key={particle.id}
              className="absolute h-1.5 w-1.5 rounded-full bg-white/20 sm:h-2 sm:w-2"
              initial={{
                x: particle.left,
                y: particle.top,
                scale: particle.scale,
              }}
              animate={
                prefersReducedMotion
                  ? { opacity: [0.2, 0.35, 0.2] }
                  : {
                      y: ['0%', '-110%'],
                      opacity: [0, 1, 0],
                    }
              }
              transition={{
                duration: prefersReducedMotion ? particle.duration * 1.4 : particle.duration,
                repeat: Infinity,
                delay: particle.delay,
                ease: 'linear',
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
              className="text-3xl sm:text-5xl md:text-6xl font-bold mb-4"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: shouldReduceMotion ? 0.35 : 0.6, delay: 0.2 }}
            >
              Our Team
            </motion.h1>
            <motion.p 
              className="text-base sm:text-xl text-amber-50 max-w-2xl mx-auto px-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: shouldReduceMotion ? 0.35 : 0.6, delay: 0.4 }}
            >
              The passionate individuals driving code.scriet forward
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Filter Tabs */}
      {teams.length > 1 && (
        <section className="py-6 sm:py-8 bg-white/90 backdrop-blur-sm border-b border-amber-200 sticky top-under-header z-40">
          <div className="container mx-auto px-4">
            <motion.div 
              className="no-scrollbar flex flex-nowrap items-center justify-start gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:justify-center sm:overflow-visible sm:pb-0 sm:gap-3"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: shouldReduceMotion ? 0.3 : 0.5 }}
            >
              {teams.map((team, index) => (
                <motion.div
                  key={team}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: shouldReduceMotion ? 0.2 : 0.3, delay: index * 0.05 }}
                >
                  <Button
                    variant={activeTeam === team ? 'default' : 'outline'}
                    onClick={() => setActiveTeam(team)}
                    size="sm"
                    className={`min-w-16 shrink-0 sm:min-w-24 text-sm transition-all duration-300 ${
                      activeTeam === team 
                        ? 'shadow-lg shadow-amber-500/30 scale-105' 
                        : 'sm:hover:scale-105 sm:hover:shadow-md'
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
                  transition={{ duration: shouldReduceMotion ? 0.3 : 0.5 }}
                >
                  {activeTeam} Team
                </motion.h2>
                <TeamGrid 
                  members={filteredMembers.sort((a, b) => (a.order || 0) - (b.order || 0))}
                  isMobile={isMobile}
                  prefersReducedMotion={prefersReducedMotion}
                  shouldReduceMotion={shouldReduceMotion}
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
                    transition={{ duration: shouldReduceMotion ? 0.35 : 0.7, delay: teamIndex * 0.15 }}
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
                          transition={{ duration: shouldReduceMotion ? 0.3 : 0.6, delay: 0.3 }}
                          viewport={{ once: true }}
                        />
                      </span>
                    </motion.h2>
                    <TeamGrid 
                      members={members.sort((a, b) => (a.order || 0) - (b.order || 0))}
                      isMobile={isMobile}
                      prefersReducedMotion={prefersReducedMotion}
                      shouldReduceMotion={shouldReduceMotion}
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
function TeamGrid({
  members,
  isMobile,
  prefersReducedMotion,
  shouldReduceMotion,
}: {
  members: TeamMember[];
  isMobile: boolean;
  prefersReducedMotion: boolean;
  shouldReduceMotion: boolean;
}) {
  const totalMembers = members.length;
  
  // Calculate animation delay based on position from center (slower animation)
  const getAnimationDelay = (index: number) => {
    const centerIndex = (totalMembers - 1) / 2;
    const distanceFromCenter = Math.abs(index - centerIndex);
    return shouldReduceMotion ? distanceFromCenter * 0.08 + 0.05 : distanceFromCenter * 0.2 + 0.1;
  };

  // Calculate horizontal offset for center-out animation (reduced offset)
  const getInitialX = (index: number) => {
    if (isMobile) return 0;
    const centerIndex = (totalMembers - 1) / 2;
    const position = index - centerIndex;
    return position > 0 ? 40 : position < 0 ? -40 : 0; // Less dramatic horizontal offset
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-wrap justify-center gap-5 md:gap-8">
      {members.map((member, index) => (
        <MemberCard 
          key={member.id} 
          member={member} 
          delay={getAnimationDelay(index)}
          initialX={getInitialX(index)}
          isMobile={isMobile}
          prefersReducedMotion={prefersReducedMotion}
          shouldReduceMotion={shouldReduceMotion}
        />
      ))}
    </div>
  );
}

function MemberCard({ 
  member, 
  delay = 0,
  initialX = 0,
  isMobile,
  prefersReducedMotion,
  shouldReduceMotion,
}: { 
  member: TeamMember; 
  delay?: number;
  initialX?: number;
  isMobile: boolean;
  prefersReducedMotion: boolean;
  shouldReduceMotion: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const navigate = useNavigate();
  const interactiveHover = !isMobile && !prefersReducedMotion;

  // Only allow navigation if the member has a slug (linked to a user)
  const hasProfile = !!member.slug;
  const profileUrl = hasProfile ? `/team/${member.slug}` : '';

  const handleCardClick = () => {
    if (hasProfile) {
      navigate(profileUrl);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (hasProfile && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      navigate(profileUrl);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: initialX, y: 20, scale: 0.95 }}
      whileInView={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ 
        duration: shouldReduceMotion ? 0.35 : 0.8, 
        delay: delay,
        ease: [0.22, 1, 0.36, 1]
      }}
      whileHover={interactiveHover ? { y: -6, transition: { duration: 0.3 } } : undefined}
      onHoverStart={interactiveHover ? () => setIsHovered(true) : undefined}
      onHoverEnd={() => setIsHovered(false)}
      className="w-full max-w-[220px] text-center sm:w-40 md:w-48"
    >
      {/* Card with glassmorphism effect - fixed height for consistency */}
      <div
        role={hasProfile ? 'link' : undefined}
        tabIndex={hasProfile ? 0 : undefined}
        onClick={handleCardClick}
        onKeyDown={hasProfile ? handleKeyDown : undefined}
        aria-label={hasProfile ? `View ${member.name}'s profile` : member.name}
        className={`relative group h-full min-h-[230px] sm:min-h-[280px] md:min-h-[300px] rounded-2xl border p-3 sm:p-5 flex flex-col transition-all duration-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 ${
          hasProfile ? 'cursor-pointer' : 'cursor-default'
        } ${
          isMobile
            ? 'bg-white border-white/90 shadow-md'
            : 'bg-white/70 backdrop-blur-sm border-white/80 shadow-lg hover:shadow-2xl hover:shadow-amber-500/20'
        }`}
      >
        {/* Animated gradient border on hover */}
        {!isMobile && (
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
        )}
        
        {/* Avatar container */}
        <div className="relative mb-5 z-10 flex-shrink-0">
          <motion.div 
            className="mx-auto h-20 w-20 overflow-hidden rounded-full relative sm:h-24 sm:w-24 md:h-28 md:w-28"
            whileHover={interactiveHover ? { scale: 1.05 } : undefined}
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
              animate={interactiveHover && isHovered ? {
                backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
              } : {}}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            >
              <div className="w-full h-full rounded-full bg-white p-0.5">
                <img
                  src={member.imageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.name}`}
                  alt={member.name}
                  loading="lazy"
                  className="w-full h-full object-cover rounded-full transition-transform duration-500 group-hover:scale-110"
                />
              </div>
            </motion.div>
            
            {/* Glow effect on hover */}
            {!isMobile && (
              <motion.div
                className="absolute inset-0 rounded-full bg-amber-400/30 blur-xl -z-10"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={isHovered ? { opacity: 1, scale: 1.2 } : { opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.4 }}
              />
            )}
          </motion.div>
        </div>
        
        {/* Member info - flex-grow to push icons to bottom */}
        <div className="flex-grow flex flex-col justify-center">
          <motion.h3 
            className="font-bold text-amber-900 text-base md:text-lg mb-1 relative z-10 line-clamp-2 min-h-[2.5rem] flex items-center justify-center"
            animate={interactiveHover && isHovered ? { scale: 1.02 } : { scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            {member.name}
          </motion.h3>
          <motion.p 
            className="text-xs md:text-sm text-gray-600 mb-3 relative z-10 line-clamp-1"
            initial={{ opacity: isMobile ? 1 : 0.85 }}
            animate={interactiveHover && isHovered ? { opacity: 1 } : { opacity: isMobile ? 1 : 0.85 }}
            transition={{ duration: 0.3 }}
          >
            {member.role}
          </motion.p>
        </div>
        
        {/* Social links - always at bottom */}
        <motion.div 
          className="flex justify-center gap-3 relative z-10 mt-auto pt-2"
          initial={{ opacity: isMobile ? 1 : 0.75 }}
          animate={interactiveHover && isHovered ? { opacity: 1 } : { opacity: isMobile ? 1 : 0.75 }}
          transition={{ duration: 0.4 }}
        >
          {member.github && (
            <SocialLink 
              href={member.github.startsWith('http') ? member.github : `https://github.com/${member.github}`}
              icon={<Github className="h-4 w-4" />}
              hoverColor="hover:text-gray-800 hover:bg-gray-100"
              delay={0}
              isMobile={isMobile}
            />
          )}
          {member.linkedin && (
            <SocialLink 
              href={member.linkedin.startsWith('http') ? member.linkedin : `https://linkedin.com/in/${member.linkedin}`}
              icon={<Linkedin className="h-4 w-4" />}
              hoverColor="hover:text-blue-600 hover:bg-blue-50"
              delay={0.05}
              isMobile={isMobile}
            />
          )}
          {member.twitter && (
            <SocialLink 
              href={member.twitter.startsWith('http') ? member.twitter : `https://twitter.com/${member.twitter}`}
              icon={<Twitter className="h-4 w-4" />}
              hoverColor="hover:text-sky-500 hover:bg-sky-50"
              delay={0.1}
              isMobile={isMobile}
            />
          )}
          {member.instagram && (
            <SocialLink 
              href={member.instagram.startsWith('http') ? member.instagram : `https://instagram.com/${member.instagram}`}
              icon={<Instagram className="h-4 w-4" />}
              hoverColor="hover:text-pink-500 hover:bg-pink-50"
              delay={0.15}
              isMobile={isMobile}
            />
          )}
        </motion.div>

        {/* "Get to know" CTA - only for members with a profile */}
        {hasProfile && (
          <motion.div
            className="relative z-10 mt-3"
            initial={{ opacity: isMobile ? 0.85 : 0 }}
            animate={interactiveHover && isHovered ? { opacity: 1, y: 0 } : { opacity: isMobile ? 0.85 : 0, y: isMobile ? 0 : 4 }}
            transition={{ duration: 0.3 }}
          >
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1 text-[11px] font-semibold text-white shadow-sm shadow-amber-500/30">
              Get to know
              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 6h8M6 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function SocialLink({ 
  href, 
  icon, 
  hoverColor,
  delay,
  isMobile,
}: { 
  href: string; 
  icon: React.ReactNode; 
  hoverColor: string;
  delay: number;
  isMobile: boolean;
}) {
  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`p-2 rounded-full text-gray-400 transition-all duration-300 ${hoverColor}`}
      whileHover={isMobile ? undefined : { scale: 1.2, rotate: 5 }}
      whileTap={{ scale: 0.9 }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      {icon}
    </motion.a>
  );
}
