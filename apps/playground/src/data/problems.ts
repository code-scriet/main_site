import type { Problem } from '@/context/PlaygroundContext';

export const SAMPLE_PROBLEMS: Problem[] = [
  {
    id: 'two-sum',
    title: 'Two Sum',
    difficulty: 'Easy',
    description:
      'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target. You may assume that each input would have exactly one solution, and you may not use the same element twice.',
    examples: [
      {
        input: 'nums = [2,7,11,15], target = 9',
        output: '[0,1]',
        explanation: 'Because nums[0] + nums[1] == 9, we return [0, 1].',
      },
      {
        input: 'nums = [3,2,4], target = 6',
        output: '[1,2]',
      },
    ],
    constraints: [
      '2 <= nums.length <= 104',
      '-109 <= nums[i] <= 109',
      '-109 <= target <= 109',
      'Only one valid answer exists.',
    ],
    testCases: [
      {
        id: '1',
        input: '[2,7,11,15]\n9',
        expectedOutput: '[0,1]',
      },
      {
        id: '2',
        input: '[3,2,4]\n6',
        expectedOutput: '[1,2]',
      },
      {
        id: '3',
        input: '[3,3]\n6',
        expectedOutput: '[0,1]',
      },
    ],
  },
  {
    id: 'palindrome-number',
    title: 'Palindrome Number',
    difficulty: 'Easy',
    description:
      'Given an integer x, return true if x is a palindrome, and false otherwise. An integer is a palindrome when it reads the same backward as forward.',
    examples: [
      {
        input: 'x = 121',
        output: 'true',
        explanation: '121 reads as 121 from left to right and from right to left.',
      },
      {
        input: 'x = -121',
        output: 'false',
        explanation: 'From left to right, it reads -121. From right to left, it becomes 121-.',
      },
      {
        input: 'x = 10',
        output: 'false',
        explanation: 'Reads 01 from right to left.',
      },
    ],
    constraints: ['-231 <= x <= 231 - 1'],
    testCases: [
      {
        id: '1',
        input: '121',
        expectedOutput: 'true',
      },
      {
        id: '2',
        input: '-121',
        expectedOutput: 'false',
      },
      {
        id: '3',
        input: '10',
        expectedOutput: 'false',
      },
    ],
  },
  {
    id: 'reverse-string',
    title: 'Reverse String',
    difficulty: 'Easy',
    description:
      'Write a function that reverses a string. The input string is given as an array of characters s. You must do this by modifying the input array in-place with O(1) extra memory.',
    examples: [
      {
        input: 's = ["h","e","l","l","o"]',
        output: '["o","l","l","e","h"]',
      },
      {
        input: 's = ["H","a","n","n","a","h"]',
        output: '["h","a","n","n","a","H"]',
      },
    ],
    constraints: ['1 <= s.length <= 105', 's[i] is a printable ascii character.'],
    testCases: [
      {
        id: '1',
        input: '["h","e","l","l","o"]',
        expectedOutput: '["o","l","l","e","h"]',
      },
      {
        id: '2',
        input: '["H","a","n","n","a","h"]',
        expectedOutput: '["h","a","n","n","a","H"]',
      },
    ],
  },
  {
    id: 'fibonacci-number',
    title: 'Fibonacci Number',
    difficulty: 'Easy',
    description:
      'The Fibonacci numbers, commonly denoted F(n) form a sequence, called the Fibonacci sequence, such that each number is the sum of the two preceding ones, starting from 0 and 1. Calculate F(n).',
    examples: [
      {
        input: 'n = 2',
        output: '1',
        explanation: 'F(2) = F(1) + F(0) = 1 + 0 = 1.',
      },
      {
        input: 'n = 3',
        output: '2',
        explanation: 'F(3) = F(2) + F(1) = 1 + 1 = 2.',
      },
      {
        input: 'n = 4',
        output: '3',
        explanation: 'F(4) = F(3) + F(2) = 2 + 1 = 3.',
      },
    ],
    constraints: ['0 <= n <= 30'],
    testCases: [
      {
        id: '1',
        input: '2',
        expectedOutput: '1',
      },
      {
        id: '2',
        input: '3',
        expectedOutput: '2',
      },
      {
        id: '3',
        input: '4',
        expectedOutput: '3',
      },
    ],
  },
  {
    id: 'valid-parentheses',
    title: 'Valid Parentheses',
    difficulty: 'Easy',
    description:
      'Given a string s containing just the characters \'(\', \')\', \'{\', \'}\', \'[\' and \']\', determine if the input string is valid. An input string is valid if: Open brackets must be closed by the same type of brackets. Open brackets must be closed in the correct order.',
    examples: [
      {
        input: 's = "()"',
        output: 'true',
      },
      {
        input: 's = "()[]{}"',
        output: 'true',
      },
      {
        input: 's = "(]"',
        output: 'false',
      },
    ],
    constraints: ['1 <= s.length <= 104', 's consists of parentheses only \'()[]{}\''],
    testCases: [
      {
        id: '1',
        input: '()',
        expectedOutput: 'true',
      },
      {
        id: '2',
        input: '()[]{}',
        expectedOutput: 'true',
      },
      {
        id: '3',
        input: '(]',
        expectedOutput: 'false',
      },
    ],
  },
];
