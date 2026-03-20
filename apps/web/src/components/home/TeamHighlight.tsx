import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from 'react-router-dom';
import { Github, Linkedin, Twitter, Instagram, ArrowRight, Users, Loader2 } from 'lucide-react';
import { useMotionConfig } from '@/hooks/useMotionConfig';
import { useHomePageData } from '@/hooks/useHomePageData';

export function TeamHighlight() {
  const { data: homeData, isLoading } = useHomePageData();
  const teamMembers = homeData?.teamHighlights ?? [];
  const { isMobile, shouldReduceMotion } = useMotionConfig();
  const navigate = useNavigate();

  // Animation configs based on device
  const animationDuration = shouldReduceMotion ? 0.3 : 0.6;
  const animationY = shouldReduceMotion ? 15 : 30;
  const staggerDelay = shouldReduceMotion ? 0.05 : 0.1;

  return (
    <section className="py-16 sm:py-24 bg-gradient-to-b from-white to-gray-50 relative overflow-hidden">
      {/* Background Decoration */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] sm:w-[600px] sm:h-[600px] md:w-[800px] md:h-[800px] bg-gradient-radial from-amber-100/30 to-transparent rounded-full" />{/* responsive: scale decorative blob */}
      
      <div className="container mx-auto px-4 relative">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 10 : 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: animationDuration }}
          viewport={{ once: true, margin: '-50px' }}
          className="text-center mb-8 sm:mb-12 lg:mb-16"
        >
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-3 sm:mb-4">
            Meet Our{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-600">
              Team
            </span>
          </h2>
          <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto px-2">
            The passionate individuals driving code.scriet forward and building an amazing community
          </p>
        </motion.div>

        {/* Team Grid */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-amber-600" />
          </div>
        ) : teamMembers.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-100 mb-6">
              <Users className="h-10 w-10 text-blue-500" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Team info coming soon!</h3>
            <p className="text-gray-500">Stay tuned to meet our amazing team</p>
          </motion.div>
        ) : (
          <div className="relative mb-8 sm:mb-12">
            {/* Subtle bottom shade-out — visible on all screens, slightly stronger on mobile */}
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 sm:h-12 bg-gradient-to-t from-gray-50 via-gray-50/40 to-transparent z-10" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6 md:gap-8">
            {teamMembers.map((member, index) => {
                const profileSlugOrId = member.slug || member.id;
                const hasProfile = Boolean(profileSlugOrId);
                const profileUrl = hasProfile ? `/team/${profileSlugOrId}` : '';

                return (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, y: animationY }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: shouldReduceMotion ? 0.3 : 0.5, delay: index * staggerDelay }}
                viewport={{ once: true, margin: '-50px' }}
                whileHover={!isMobile ? { y: -10 } : undefined}
                role={hasProfile ? 'link' : undefined}
                tabIndex={hasProfile ? 0 : undefined}
                onClick={hasProfile ? () => navigate(profileUrl) : undefined}
                onKeyDown={hasProfile ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(profileUrl);
                  }
                } : undefined}
                aria-label={hasProfile ? `View ${member.name}'s profile` : member.name}
                className={`group h-full rounded-2xl border border-gray-200/70 bg-white/70 p-3 sm:p-4 text-center shadow-sm transition-all duration-300 ${hasProfile ? 'cursor-pointer hover:border-amber-300 hover:shadow-md' : 'cursor-default'}`}
              >
                {/* Avatar */}
                <div className="relative mb-4 mx-auto">
                  {/* Glow effect - only on desktop */}
                  {!isMobile && (
                    <div className="absolute -inset-2 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-500" />
                  )}
                  
                  {/* Image container */}
                  <div className="relative w-24 h-24 md:w-28 md:h-28 mx-auto">
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full p-[3px]">
                      <div className="w-full h-full bg-white rounded-full overflow-hidden">
                        <img
                          src={member.imageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.name}`}
                          alt={member.name}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        />
                      </div>
                    </div>
                    
                    {/* Status indicator */}
                    <div className="absolute bottom-1 right-1 w-5 h-5 bg-green-500 border-2 border-white rounded-full shadow-sm" />
                  </div>
                </div>
                
                {/* Info */}
                <h3 className="font-semibold text-gray-900 mb-1 min-h-[2.5rem] flex items-center justify-center line-clamp-2 group-hover:text-amber-600 transition-colors">
                  {member.name}
                </h3>
                <p className="text-sm text-gray-500 mb-3 min-h-[1.25rem] line-clamp-1">{member.role}</p>
                {hasProfile && (
                  <Link to={profileUrl} className="sr-only">
                    View {member.name}'s profile
                  </Link>
                )}
                
                {/* Social Links - simplify animations on mobile */}
                <div className="flex justify-center gap-3 mt-auto pt-2 min-h-[40px]">
                  {member.github && (
                    <motion.a
                      href={member.github.startsWith('http') ? member.github : `https://github.com/${member.github}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-2 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-900 hover:text-white transition-all"
                      whileHover={!isMobile ? { scale: 1.1 } : undefined}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Github className="h-4 w-4" />
                    </motion.a>
                  )}
                  {member.linkedin && (
                    <motion.a
                      href={member.linkedin.startsWith('http') ? member.linkedin : `https://linkedin.com/in/${member.linkedin}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-2 rounded-lg bg-gray-100 text-gray-500 hover:bg-blue-600 hover:text-white transition-all"
                      whileHover={!isMobile ? { scale: 1.1 } : undefined}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Linkedin className="h-4 w-4" />
                    </motion.a>
                  )}
                  {member.twitter && (
                    <motion.a
                      href={member.twitter.startsWith('http') ? member.twitter : `https://twitter.com/${member.twitter}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-2 rounded-lg bg-gray-100 text-gray-500 hover:bg-sky-500 hover:text-white transition-all"
                      whileHover={!isMobile ? { scale: 1.1 } : undefined}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Twitter className="h-4 w-4" />
                    </motion.a>
                  )}
                  {member.instagram && (
                    <motion.a
                      href={member.instagram.startsWith('http') ? member.instagram : `https://instagram.com/${member.instagram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-2 rounded-lg bg-gray-100 text-gray-500 hover:bg-pink-500 hover:text-white transition-all"
                      whileHover={!isMobile ? { scale: 1.1 } : undefined}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Instagram className="h-4 w-4" />
                    </motion.a>
                  )}
                </div>
              </motion.div>
                );
              })}
          </div>
          </div>
        )}

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 10 : 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: animationDuration, delay: shouldReduceMotion ? 0.1 : 0.5 }}
          viewport={{ once: true, margin: '-50px' }}
          className="text-center"
        >
          <Link to="/team">
            <Button 
              variant="outline" 
              size="lg" 
              className="group border-gray-300 hover:border-blue-500 hover:bg-blue-50"
            >
              Meet the Full Team
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
