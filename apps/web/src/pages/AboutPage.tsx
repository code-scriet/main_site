import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Target, Eye, Rocket, Code, Users, Trophy, 
  Heart, BookOpen, Globe, Handshake, Check, GraduationCap
} from 'lucide-react';

export default function AboutPage() {
  return (
    <Layout>
      <SEO 
        title="About Us"
        description="Learn about code.scriet - SCRIET's premier coding club. Discover our journey, philosophy, and mission to build an environment where curiosity becomes capability."
        url="/about"
        keywords="about code.scriet, SCRIET coding club, coding community, student empowerment, tech ecosystem"
      />
      
      {/* Hero Section */}
      <section className="py-16 sm:py-24 bg-gradient-to-br from-amber-400 via-orange-500 to-amber-600 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-72 h-72 bg-white rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-white rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div>
        
        <div className="container mx-auto px-4 relative">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="text-center max-w-4xl mx-auto"
          >
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm mb-6 shadow-2xl"
            >
              <Heart className="h-10 w-10 text-white" />
            </motion.div>
            
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4 tracking-tight">
              About code.scriet
            </h1>
            
            <p className="text-xl sm:text-2xl text-amber-50 font-medium mb-6">
              Building tomorrow's problem solvers through community, collaboration, and continuous learning
            </p>
          </motion.div>
        </div>
      </section>

      {/* Our Story - Philosophy Section */}
      <section className="py-16 sm:py-20 bg-white">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="max-w-5xl mx-auto"
          >
            {/* Section Header */}
            <div className="text-center mb-12">
              <Badge className="bg-amber-100 text-amber-700 border-amber-200 mb-4">
                <Heart className="h-3 w-3 mr-1" />
                Our Journey
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
                Achievements & Momentum
              </h2>
              <p className="text-xl text-amber-700 font-semibold mb-3">
                Code.Scriet — Built Different.
              </p>
              <div className="max-w-3xl mx-auto space-y-4">
                <p className="text-gray-700 text-lg">
                  Code.Scriet was founded with one belief:
                </p>
                <blockquote className="text-2xl text-gray-900 font-medium italic border-l-4 border-amber-500 pl-6 py-2">
                  "Students don't need more clubs. They need ecosystems."
                </blockquote>
                <p className="text-gray-600 text-base">
                  In just three months, we've moved fast—building skills, confidence, leadership, 
                  and a culture that puts students first. Aggressively first.
                </p>
              </div>
            </div>

            {/* Early Impact Stats */}
            <div className="mb-12">
              <h3 className="text-2xl font-bold text-center text-gray-900 mb-3">
                Early Impact, Real Momentum
              </h3>
              <p className="text-center text-gray-600 mb-8">We're young. But we're not idle.</p>
              
              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                {[
                  { label: '3 months', sublabel: 'since inception', desc: 'Continuous on-ground activity' },
                  { label: '300+', sublabel: 'students empowered', desc: 'Through hands-on learning & mentorship' },
                  { label: '3', sublabel: 'high-engagement events', desc: 'Focused on practical growth' },
                  { label: '1', sublabel: 'foundational workshop', desc: 'Git & GitHub mastery' },
                  { label: '1', sublabel: 'media mention', desc: 'Public recognition secured' },
                ].map((stat, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: idx * 0.1 }}
                    viewport={{ once: true }}
                  >
                    <Card className="text-center border-amber-200 hover:shadow-md transition-shadow h-full">
                      <CardContent className="p-4">
                        <div className="text-3xl font-bold text-amber-600 mb-1">{stat.label}</div>
                        <div className="text-sm font-semibold text-gray-900 mb-2">{stat.sublabel}</div>
                        <div className="text-xs text-gray-600">{stat.desc}</div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
              
              <p className="text-center text-xl font-semibold text-amber-900">
                Not experiments. Execution.
              </p>
            </div>

            {/* What We've Built */}
            <div className="mb-12 bg-amber-50 -mx-4 px-4 py-8 rounded-xl">
              <h3 className="text-2xl font-bold text-center text-gray-900 mb-3">
                What We've Actually Built on Campus
              </h3>
              <p className="text-center text-lg text-gray-700 mb-2">
                Code.Scriet isn't "just tech."
              </p>
              <p className="text-center text-xl font-bold text-amber-700 mb-6">
                It's a student-development engine.
              </p>
              
              <div className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto">
                {[
                  'Introduced practical, real-world skills early in students\' academic journeys',
                  'Created a culture of learning by doing, not passive listening',
                  'Helped students move from curiosity to confidence—especially those with zero prior exposure',
                  'Built a growing internal network of learners, leaders, and collaborators'
                ].map((point, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: idx * 0.1 }}
                    viewport={{ once: true }}
                    className="flex items-start gap-3 bg-white p-4 rounded-lg border border-amber-200"
                  >
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm font-bold mt-0.5">
                      <Check className="h-4 w-4" />
                    </div>
                    <p className="text-gray-700">{point}</p>
                  </motion.div>
                ))}
              </div>
              
              <p className="text-center text-gray-600 italic mt-6">
                This is groundwork. The kind that lasts.
              </p>
            </div>

            {/* Why Different */}
            <div className="mb-12">
              <h3 className="text-2xl font-bold text-center text-gray-900 mb-4">
                Why Code.Scriet Is Different
              </h3>
              <blockquote className="text-center text-xl text-gray-800 mb-6 max-w-2xl mx-auto">
                <p className="mb-2">Most clubs organize events.</p>
                <p className="text-amber-700 font-bold text-2xl">We design trajectories.</p>
              </blockquote>
              
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
                {[
                  { title: 'Tech as a Tool', desc: 'Not the end goal—empowering people is' },
                  { title: 'Holistic Focus', desc: 'Skills, mindset, leadership, and collaboration' },
                  { title: 'Systems Over Shortcuts', desc: 'Building depth before chasing scale' },
                  { title: 'Campus to Global', desc: 'Built to grow from local to international' }
                ].map((item, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: idx * 0.1 }}
                    viewport={{ once: true }}
                    className="bg-gradient-to-br from-amber-50 to-orange-50 p-4 rounded-lg border border-amber-200"
                  >
                    <h4 className="font-semibold text-gray-900 mb-2">{item.title}</h4>
                    <p className="text-sm text-gray-600">{item.desc}</p>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Mission Statement */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-300 shadow-lg">
                <CardContent className="p-8">
                  <p className="text-gray-700 mb-3">Our mission is simple, borderline audacious:</p>
                  <blockquote className="text-2xl sm:text-3xl text-gray-900 font-bold mb-3">
                    "Building an environment where curiosity becomes capability."
                  </blockquote>
                  <p className="text-amber-700 font-semibold">And we're serious about earning that title.</p>
                </CardContent>
              </Card>
            </motion.div>

            {/* Momentum Over Milestones */}
            <div className="mt-12 text-center">
              <h3 className="text-2xl font-bold text-gray-900 mb-4">
                Momentum Over Milestones
              </h3>
              <p className="text-lg text-gray-700 mb-3 max-w-2xl mx-auto">
                We don't believe achievements are endpoints. They're signals.
              </p>
              <Card className="inline-block bg-amber-100 border-amber-300 max-w-2xl">
                <CardContent className="p-6">
                  <p className="text-gray-700 mb-2">In our first phase, we've proven one thing clearly:</p>
                  <p className="text-xl font-bold text-amber-900">
                    When given the right environment, students rise fast.
                  </p>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Vision & Mission Cards */}
      <section className="py-20 bg-amber-50">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <Card className="h-full bg-gradient-to-br from-amber-100 to-orange-50 border-amber-200">
                <CardContent className="p-8">
                  <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 mb-6">
                    <Eye className="h-8 w-8 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-amber-900 mb-4">Our Vision</h2>
                  <p className="text-gray-700 text-lg">
                    To create a thriving community of problem solvers who are equipped with the skills and mindset to tackle any technical challenge and make a positive impact in the tech industry.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <Card className="h-full bg-gradient-to-br from-amber-100 to-orange-50 border-amber-200">
                <CardContent className="p-8">
                  <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 mb-6">
                    <Target className="h-8 w-8 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-amber-900 mb-4">Our Mission</h2>
                  <p className="text-gray-700 text-lg">
                    To provide a supportive platform for students to learn, practice, and excel in programming through hands-on workshops, collaborative projects, and mentorship opportunities.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true }}
            className="max-w-5xl mx-auto mt-8"
          >
            <Card className="bg-white border-amber-200 shadow-sm">
              <CardContent className="p-6 sm:p-8 text-center">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 mb-4">
                  <GraduationCap className="h-7 w-7 text-amber-700" />
                </div>
                <p className="text-sm font-semibold tracking-wide text-amber-700 uppercase mb-2">
                  Teacher Incharge
                </p>
                <h3 className="text-2xl font-bold text-gray-900">Er. Pravin Pavar Sir</h3>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* What We Do */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl font-bold text-amber-900 mb-4">What We Do</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Our focus areas are designed to help members grow as developers and problem solvers
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Code, title: 'Data Structures & Algorithms', description: 'Master the fundamentals through practice and peer learning' },
              { icon: Users, title: 'Collaborative Projects', description: 'Build real-world applications together as a team' },
              { icon: Trophy, title: 'Competitive Programming', description: 'Participate in contests and sharpen your skills' },
              { icon: Rocket, title: 'Career Development', description: 'Prepare for technical interviews and career growth' },
            ].map((area, index) => (
              <motion.div
                key={area.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
              >
                <Card className="h-full hover:shadow-lg transition-all duration-300">
                  <CardContent className="p-6 text-center">
                    <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 mb-4">
                      <area.icon className="h-7 w-7 text-amber-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-amber-900 mb-2">{area.title}</h3>
                    <p className="text-gray-600 text-sm">{area.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* What's Next Section */}
      <section className="py-16 bg-gradient-to-br from-amber-900 via-amber-800 to-orange-900 text-white relative overflow-hidden">
        <div className="container mx-auto px-4 relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="max-w-4xl mx-auto text-center"
          >
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-amber-400/20 backdrop-blur-sm mb-6 shadow-lg">
              <Rocket className="h-8 w-8 text-amber-300" />
            </div>
            
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-white">
              What's Next
            </h2>
            
            <p className="text-xl text-amber-100 mb-8 leading-relaxed">
              The next chapter is already in motion.
            </p>
            
            <div className="grid sm:grid-cols-2 gap-6 mb-8">
              {[
                { 
                  icon: BookOpen, 
                  title: 'Structured Learning Tracks', 
                  description: 'Moving beyond single workshops to comprehensive pathways'
                },
                { 
                  icon: Users, 
                  title: 'Cross-Campus Collaborations', 
                  description: 'Partnering with other clubs and institutions'
                },
                { 
                  icon: Globe, 
                  title: 'National-Level Initiatives', 
                  description: 'Expanding our reach and impact'
                },
                { 
                  icon: Handshake, 
                  title: 'Strategic Partnerships', 
                  description: 'Accelerating scale and creating opportunities'
                },
              ].map((item, index) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  className="p-6 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20 hover:bg-white/15 hover:border-amber-400/50 transition-all duration-300 shadow-lg"
                >
                  <item.icon className="h-10 w-10 text-amber-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2 text-white">{item.title}</h3>
                  <p className="text-amber-100 text-sm">{item.description}</p>
                </motion.div>
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              viewport={{ once: true }}
              className="space-y-3"
            >
              <p className="text-lg text-amber-100">
                We're not asking for belief.
              </p>
              <p className="text-xl font-semibold text-white">
                We're offering alignment.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}
